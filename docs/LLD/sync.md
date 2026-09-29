# Sync & Geofencing

The server half of offline-first (PRD §2) and of the call-location check (PRD §5.1). HLD:
[`../hld/01-sync-and-geofencing.md`](../hld/01-sync-and-geofencing.md). Roadmap phase 5. The phone's
local store and queue are built in Phase 10; this module is the contract they build against.

The rules here are the working assumptions accepted on 2026-09-29 (client sign-off G1–G8,
`../decision-log.md`).

## The model: one daily-report submit

**Nothing counts until Submit.** The MR works offline all day, and everything that belongs to the day
is committed **together, when they tap the daily report's Submit with a live connection** (PRD §2,
§6.2 Final Submission). There is no per-record commit queue and no auto-retry of the commit: a
failed submit is retried by the MR tapping Submit again, and that is safe because every record is
idempotent.

**A private backup runs underneath (G9).** Whenever the phone has a connection it uploads its
draft records to a holding area on the server (*Draft backup* below), so a lost or broken phone
doesn't lose the day. Drafts are invisible to everyone but the MR and change nothing: no report, no
count, no sample or stock balance, no gate, no compliance check. The commit is still Submit alone.

**Submit reconciles both sides (G10).** It pushes the final set, the server commits it and returns
*its* version of every record (assigned ids, the recomputed geofence status, per-record failures);
the phone replaces its local copies with those, refreshes its reference data, and the server clears
the day's drafts. The server's answer wins.

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
  dependency or a cycle is `INVALID_DEPENDENCY`. A batch is capped at `SYNC_MAX_BATCH` records (100).
- **Idempotent on `clientId`.** A `SyncReceipt` — unique on `(userId, clientId)` — is written in the
  same transaction as the record. Sending a record again returns `ALREADY_SYNCED` with the original
  `serverId`. Only `SYNCED` records get a receipt: a `FAILED` one is retried from scratch, so the MR
  can fix it and send it again. Two requests racing on one `clientId` are settled by the unique
  index; the loser answers `ALREADY_SYNCED` (the duplicate is thrown out of the transaction and
  caught outside it — `../engineering/coding-standards.md`, *Transactions and unique keys*).
- **One transaction per record**, so a failure leaves no half-written record and never undoes its
  neighbours. Records are applied one after another, in order — a later call must fail on an
  allocation an earlier one used up, not race it — so a push's time grows with its size: about
  0.19 s a record measured against the remote dev cluster (three round trips a record at ~60 ms;
  expect far less next to the database). **The app therefore sends a big day in chunks of at most
  `SYNC_MAX_BATCH`**, oldest and parents first, the DCR's own submit in the last chunk — a dependency
  on a record from an earlier chunk is satisfied by its receipt, so chunking needs nothing special.
  A retry resends only what isn't `SYNCED` yet, or simply everything.
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

## Draft backup

The holding area for the day's unsent records (sign-off G9). It stores each record as an opaque blob
and applies **no** business rules — the real handlers run only at Submit — so it can never disagree
with them or leave a half-applied state.

- **Upload:** `PUT /api/sync/drafts` — a batch of `{ clientId, kind, clientUpdatedAt, payload }`, or
  `{ clientId, clientUpdatedAt, deleted: true }` for a record the MR removed. It is an **upsert by
  `clientId`**, per user, with **last write wins** on `clientUpdatedAt`, decided atomically by the
  database (a conditional upsert that only matches an *older* held copy, with a unique index
  refusing the rest): an older or equal copy — a stale upload, the second phone — never overwrites
  a newer one, and a removal is kept as a tombstone so an old copy can't bring the record back. The
  answer is **one result per draft**: `STORED`, `STALE` (an equal-or-newer copy is held, so nothing
  changed), `SUBMITTED` (that record already reached the server, so the draft is moot) or
  `REJECTED` with a reason (`DRAFT_TOO_LARGE`, `DRAFT_LIMIT_REACHED`, `CLIENT_TIME_INVALID` — a
  `clientUpdatedAt` more than `SYNC_CLOCK_SKEW_MINUTES` ahead would otherwise win last-write-wins
  against every honest copy for ever). The phone sends it whenever it has a connection and
  something changed, debounced; it needs no more than "stored". A batch is at most `SYNC_MAX_BATCH`,
  and the 2 MB body limit applies, so a phone with many large drafts sends several requests.
- **Restore:** `GET /api/sync/drafts?after=<cursor>&limit=<n>` (default 100, at most 200) returns the
  caller's live drafts — `{ clientId, kind, clientUpdatedAt, payload }` — oldest first, with a
  `nextCursor` for the next page (a day can hold up to `SYNC_MAX_DRAFTS` blobs, too many for one
  response). Removed drafts aren't returned, and neither is one whose record has since reached the
  server, so a stale upload that raced a Submit can't come back as if it were still unsent. Logging in
  on a new phone brings the day back; with the 2-device limit an MR can carry on from either phone,
  and if both edit one record the later edit wins.
- **Private:** the caller comes from the token — there is no way to name another user — and no other
  endpoint, module or report reads the collection. A draft is unvalidated and may be broken; it is
  never treated as a record.
- **Limits:** a draft's payload is at most `SYNC_MAX_DRAFT_BYTES` (64 KB, measured in bytes, not
  characters), and an MR keeps at most `SYNC_MAX_DRAFTS` (2,000) at once. Only a *new* draft takes a
  slot: editing one the server holds, or removing one, never needs one. The count is checked before
  the write, so two simultaneous batches can overshoot it by at most a batch — a guard against dumping
  files, not an exact quota.
- **Clearing:** a record that commits at Submit has its draft deleted **in the same transaction as its
  receipt**, so a record that didn't commit keeps its draft (the MR can restore and fix it) and one
  that did can't leave one behind. Every draft row carries its own `expiresAt`, set at write time from
  `SYNC_DRAFT_TTL_DAYS` (30) — so the setting is live, unlike a fixed-age index — and a MongoDB TTL
  index on it purges abandoned drafts and old tombstones. (A removal older than the TTL is forgotten,
  so a copy that turns up after that could return; no honest phone is offline that long, and a record
  that old is refused at Submit anyway.)
- **Not a shortcut:** the phone can't submit a draft by id; Submit sends the records themselves, so
  what is committed is exactly what the MR looked at when they tapped it.

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
until its owner registers it, so it imports only Identity (to check the caller). the module also owns the draft collection; Field Master Data
registers `NEW_DOCTOR`'s handler and its pull source; Territory, HR, Planning and Config register
their sources; Phase 6 adds the calls, expenses, orders, gifts, services and the DCR submit.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `PUT` | `/api/sync/drafts` | FIELD | Back up the day's unsent records (private, unvalidated, last write wins) |
| `GET` | `/api/sync/drafts` | FIELD | Restore them, e.g. on a new phone — paged by cursor |
| `POST` | `/api/sync/push` | FIELD | Submit: commit the day's records, with a result per record. A body over 2 MB is a 413, malformed JSON a 400 |
| `GET` | `/api/sync/pull` | FIELD | The MR's reference data, as versioned snapshots |

## Config

`GEO_FENCE_RADIUS_METERS` (200), `GEO_MAX_ACCURACY_METERS` (100), `SYNC_MAX_BATCH` (100),
`SYNC_MAX_AGE_DAYS` (7), `SYNC_CLOCK_SKEW_MINUTES` (10), `SYNC_DRAFT_TTL_DAYS` (30),
`SYNC_MAX_DRAFT_BYTES` (65,536) and `SYNC_MAX_DRAFTS` (2,000).

## Edge cases

- **The connection drops mid-push.** Records already committed have receipts; the MR taps Submit
  again and they come back `ALREADY_SYNCED`. Nothing is lost or doubled.
- **The phone is lost or broken before Submit.** The draft backup has the day (as of the last time
  the phone had a connection); logging in on another phone restores it, and the MR submits from there.
  Anything created after the last upload is lost.
- **A record fixed after `FAILED`.** It has no receipt, so it is applied fresh — and if the MR sends
  the *same* `clientId` with a changed payload after `SYNCED`, the original result stands; a
  correction after sync is a new record or an Admin edit, never a silent overwrite.
- **A stale reference cache** (a sample allocation used up, a Doctor reassigned) surfaces at Submit
  as that record's `reason`, with the rest of the day intact.

## Dependencies

Identity (the caller). Everything else reaches this module by registering into it.

## Deliberately deferred

- A draft **visible to the manager** before Submit (a live view of the MR's day). Drafts are private
  by design (G9); anything the manager can see is a submitted report.
- Attachments and receipt photos, if the client wants them for Expenses (sign-off F2).
- Row-level delta pull, if a source ever grows too large to send whole.
