# Sync & Geofencing

The server half of offline-first (PRD §2) and of the call-location check (PRD §5.1). HLD:
[`../hld/01-sync-and-geofencing.md`](../hld/01-sync-and-geofencing.md). Roadmap phase 5. The phone's
local store and queue are built in Phase 10; this module is the contract they build against.

The rules here are the working assumptions accepted on 2026-09-29 (client sign-off G1–G8,
`../decision-log.md`).

## The model: one daily-report submit

Nothing syncs in the background. The MR works offline all day, and everything that belongs to the
day goes to the server **together, when they tap the daily report's Submit with a live connection**
(PRD §2, §6.2 Final Submission). There is no per-record queue and no auto-retry: a failed submit is
retried by the MR tapping Submit again, and that is safe because every record is idempotent.

**In the daily report (created offline, sent at Submit):** Doctors the MR added, Doctor and Chemist
Calls with the samples given in them, Follow-ups, Expenses, Orders, Doctor Gifts marked done, Doctor
Service requests, and the Monthly Stock counts. (Field Activity, Sales & Orders register these kinds
in Phase 6; today only *Add Doctor* exists to sync.)

**Online only — needs a live connection at the moment of the action:** Daily and Monthly Plan
submit, in-day Plan changes, Leave requests, approvals, and login and device actions. They answer
with something the MR needs at once (the gate, a balance, an approval), so an eventually-consistent
answer would be wrong. Their endpoints are the modules' own; they don't pass through sync.

## Push

`POST /api/sync/push` (FIELD only):

```jsonc
{ "records": [
  { "clientId": "uuid", "kind": "NEW_DOCTOR", "dependsOn": [], "clientCreatedAt": "2026-10-05T04:12:00Z", "payload": { … } },
  …
] }
```

Response `200` with a **result per record** — never one verdict for the batch:
`{ clientId, status: "SYNCED" | "ALREADY_SYNCED" | "FAILED", serverId?, reason?: { code, message } }`.
Only a malformed envelope (or no login) is a 4xx.

- **Order.** Records are applied in dependency order (`dependsOn` lists client ids; ties keep the
  order given). A record whose dependency failed is `FAILED` with `DEPENDENCY_FAILED`; an unknown
  dependency or a cycle is `INVALID_DEPENDENCY`. A batch is capped at `SYNC_MAX_BATCH` records.
- **Idempotent on `clientId`.** A `SyncReceipt` — unique on `(userId, clientId)` — is written in the
  same transaction as the record. Sending a record again returns `ALREADY_SYNCED` with the original
  `serverId`. Only `SYNCED` records get a receipt: a `FAILED` one is retried from scratch, so the MR
  can fix it and send it again. Two requests racing on one `clientId` are settled by the unique
  index; the loser answers `ALREADY_SYNCED` (the duplicate is thrown out of the transaction and
  caught outside it — `../engineering/coding-standards.md`, *Transactions and unique keys*).
- **One transaction per record**, so a failure leaves no half-written record and never undoes its
  neighbours.
- **The Final Submission is just the last record.** Field Activity (Phase 6) registers the DCR's
  submit as a kind that `dependsOn` every other record of the day. If any of them failed, it is
  `FAILED` with `DEPENDENCY_FAILED` and the DCR is not submitted; the MR fixes the failures on the
  phone and taps Submit again, and the records that already synced are `ALREADY_SYNCED`. So a DCR
  never reaches the manager with holes in it, and no special "batch" concept is needed.
- **Handlers.** An owning module registers a handler per kind, as it registers an approval kind:
  `apply({ userId, clientId, clientCreatedAt, payload }, ctx) → { serverId }`. A domain refusal is a
  `SyncRejection(code, message)` (a stale assignment, an exhausted sample allocation, a closed
  cutoff) and becomes that record's `reason`. Anything else is `INTERNAL`, retryable, and never leaks
  its detail. Master-data drift is caught here: an Admin reassigning a Doctor while the MR had a call
  for it offline makes the call `FAILED` (HLD 01 §1.4), not silently accepted.
- **Whose clock decides lateness (G3).** Offline records carry `clientCreatedAt`, and cutoffs are
  judged against it, not the arrival time. It must not be more than `SYNC_CLOCK_SKEW_MINUTES` (10)
  in the future nor older than `SYNC_MAX_AGE_DAYS` (7); otherwise the record is `FAILED` with
  `CLIENT_TIME_INVALID`. Both are SystemConfig.
- **Who:** an active FIELD employee. Whether a compliance-blocked one may still send the report that
  ends the block is Field Activity's call (`hld/10`).

## Pull

`GET /api/sync/pull` gives the phone what it caches (HLD 01 §1.1). A **versioned snapshot** per data
source (G2), not a row-level delta: the phone sends the last `version` it holds for each source and
gets back either `{ unchanged: true }` or `{ version, rows }`. A row-level delta can't see a Doctor
*appearing* because an MR regained a Route (the Doctor row didn't change) or *disappearing* because
they lost one, and an MR's set is a few hundred rows, so a snapshot is cheap and cannot drift. A
version is a hash of the snapshot's content.

- Sources register themselves, like handlers: Field Master Data (the MR's visible Doctors — the
  Route-following rule included — Chemists on their Routes, Products, remaining sample counts,
  Distributors they can act on), Territory (their Routes), HR (leave types, their balances, the
  holidays that apply to them), Planning (their Plans and statuses, for the gate), and the SystemConfig
  values the app needs offline (the geofence radius, the cutoffs).
- The response carries `serverTime`, so the phone can tell how far its clock is off.
- Everything is scoped to the caller: an MR never receives another MR's Doctors.

## Geofencing

A pure function in `shared/`, used by Field Activity (Phase 6) for every Doctor and Chemist Call:

```
evaluateGeofence({ registered, captured, accuracyMeters, radiusMeters, maxAccuracyMeters })
  → { status: "PASS" | "FAIL" | "UNVERIFIED", distanceMeters | null, reason | null }
```

- **`PASS` / `FAIL`** — the haversine distance between the captured point and the registered one,
  against `GEO_FENCE_RADIUS_METERS` (SystemConfig, seeded `200`; the client's document says 100 —
  sign-off C5). A `FAIL` **flags, it doesn't block** (HLD 01 §2.3).
- **`UNVERIFIED`** — the check can't be trusted either way, and the manager sees it like a `FAIL`.
  Two reasons: `NO_REGISTERED_LOCATION` (the Doctor or Chemist has none, so it can't be checked —
  Field Master Data's `getDoctorLocation` returns `null` for exactly this) and `LOW_ACCURACY` (the
  phone reported an accuracy worse than `GEO_MAX_ACCURACY_METERS`, seeded `100`, so a nearby-looking
  point isn't evidence). A weak reading is *low confidence*, not a failure (G6).
- **The device computes it first** — offline, from the cached registered location — and **the server
  recomputes it at sync from the canonical location and overwrites** if they disagree (HLD 01 §2.2).
  The phone sends `capturedLatitude`, `capturedLongitude` and `accuracyMeters`.
- Spoofed or mock-location detection is out of scope (G7).
- `OVERRIDE` (a manager accepting a `FAIL`) is Field Activity's, in its DCR review (Phase 6).

## Module and tier

`apps/api/src/modules/sync`, **tier 2** beside Approval: a registry that knows no kind and no source
until its owner registers it, so it imports only Identity (to check the caller). Field Master Data
registers `NEW_DOCTOR`'s handler and its pull source; Territory, HR, Planning and Config register
their sources; Phase 6 adds the calls, expenses, orders, gifts, services and the DCR submit.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/sync/push` | FIELD | Send the day's records, with a result per record |
| `GET` | `/api/sync/pull` | FIELD | The MR's reference data, as versioned snapshots |

## Config

`GEO_FENCE_RADIUS_METERS` (200), `GEO_MAX_ACCURACY_METERS` (100), `SYNC_MAX_BATCH` (500),
`SYNC_MAX_AGE_DAYS` (7), `SYNC_CLOCK_SKEW_MINUTES` (10).

## Edge cases

- **The connection drops mid-push.** Records already committed have receipts; the MR taps Submit
  again and they come back `ALREADY_SYNCED`. Nothing is lost or doubled.
- **The phone is lost before Submit.** Nothing has left the device. That's the price of syncing
  only at Submit; the daily-report design accepts it.
- **A record fixed after `FAILED`.** It has no receipt, so it is applied fresh — and if the MR sends
  the *same* `clientId` with a changed payload after `SYNCED`, the original result stands; a
  correction after sync is a new record or an Admin edit, never a silent overwrite.
- **A stale reference cache** (a sample allocation used up, a Doctor reassigned) surfaces at Submit
  as that record's `reason`, with the rest of the day intact.

## Dependencies

Identity (the caller). Everything else reaches this module by registering into it.

## Deliberately deferred

- A "save to server now" draft sync before the final Submit — the PRD says Submit only.
- Attachments and receipt photos, if the client wants them for Expenses (sign-off F2).
- Row-level delta pull, if a source ever grows too large to send whole.
