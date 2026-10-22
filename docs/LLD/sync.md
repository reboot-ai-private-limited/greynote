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
Service requests, and the Monthly Stock counts (the phone no longer sends these since 2026-10-12; the kind is still accepted). (Field Activity, Sales & Orders register these kinds
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
  order given). A record whose dependency failed *in the same batch* is `FAILED` with
  `DEPENDENCY_FAILED`. A dependency that is neither in the batch nor already synced, or a cycle, is
  `INVALID_DEPENDENCY` — which includes, across chunks, a parent that failed in an earlier request: the
  server knows only what synced, so the phone sends parents first and holds back the children of one
  that failed. A batch is capped at `SYNC_MAX_BATCH` records (100).
- **Idempotent on `clientId`.** A `SyncReceipt` — unique on `(userId, clientId)` — is written in the
  same transaction as the record. Sending a record again returns `ALREADY_SYNCED` with the original
  `serverId`. Only `SYNCED` records get a receipt: a `FAILED` one is retried from scratch, so the MR
  can fix it and send it again. Two requests racing on one `clientId` are settled by the unique
  index (the duplicate is thrown out of the transaction and caught outside it —
  `../engineering/coding-standards.md`, *Transactions and unique keys*). And whenever a record's
  attempt fails for any reason, the engine first looks for its receipt: a simultaneous send may have
  delivered it meanwhile, in which case the answer is `ALREADY_SYNCED`, not a failure the MR would
  only have to retry. (Checked live: 8 simultaneous pushes of one Doctor gave exactly one `SYNCED`
  and seven `ALREADY_SYNCED`, twice over.)
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

## The kinds registered so far

| Kind | Owner | What it does | Refusals |
|---|---|---|---|
| `NEW_DOCTOR` | Field Master Data | A Doctor the MR added offline: created `pending` with the phone's location and sent for approval (Employee → Manager → Admin), exactly as `POST /field-master-data/doctors/added` does, in the engine's transaction. The record's `serverId` is the Doctor's id. The client id is the Doctor's `clientRequestId`, so an id already used — directly or by an earlier push — returns that Doctor, never a second | `INVALID_PAYLOAD` (names the first bad field), `ROUTE_NOT_ASSIGNED` (Admin took the Route away while the phone was offline — the drift case of HLD 01 §1.4; the MR picks another), `ADDED_AT_THE_SAME_TIME` |
| `DCR_SUBMIT` | Field Activity | The day's Final Submission: the DCR goes to the manager as a `DCR` approval request, in the engine's transaction. It `dependsOn` every other record of the day, so a day with a failed record isn't submitted. The `serverId` is the DCR's id. Payload `{ reportDate }` | `INVALID_PAYLOAD`; the gate's codes `USER_BLOCKED`, `DAILY_PLAN_NOT_APPROVED`, `DATE_IN_FUTURE`, `DATE_MISMATCH`, `DCR_LOCKED` |
| `DOCTOR_CALL` | Field Activity | A call on a Doctor, with the samples given. Applied through the DCR gate; the server re-checks the Doctor is still assigned, evaluates the geofence and draws the samples down atomically. `data` is `{ geofence }`, echoed to the phone and replayed on `ALREADY_SYNCED` | `INVALID_PAYLOAD`, the gate's codes, `DOCTOR_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED`, `INVALID_WORK_WITH`, `NO_SAMPLE_ALLOCATION`, `SAMPLES_EXHAUSTED` |
| `CHEMIST_CALL` | Field Activity | A call on a Chemist; same shape without samples. `data` is `{ geofence }` | `INVALID_PAYLOAD`, the gate's codes, `CHEMIST_NOT_FOUND`, `CHEMIST_ROUTE_NOT_ASSIGNED`, `INVALID_WORK_WITH` |
| `DOCTOR_FOLLOWUP` | Field Activity | A follow-up note on a Doctor, on the day's DCR | `INVALID_PAYLOAD`, the gate's codes, `DOCTOR_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED` |
| `CHEMIST_FOLLOWUP` | Field Activity | A follow-up note on a Chemist | `INVALID_PAYLOAD`, the gate's codes, `CHEMIST_NOT_FOUND`, `CHEMIST_ROUTE_NOT_ASSIGNED` |
| `EXPENSE` | Field Activity | A manual expense on the day's DCR: `TRAVEL`, `MEAL` or `MISC`, whole paise above zero, stored `MANUAL` and `UNPAID`. TA and DA are never sent — the server computes them | `INVALID_PAYLOAD` (a decimal, zero, TA/DA), the gate's codes |
| `DOCTOR_SERVICE` | Field Activity | A Doctor Service request: stored and submitted as a `DOCTOR_SERVICE` approval request (Employee → Manager → Admin). Not part of the day, so no Plan gate; whole paise above zero | `INVALID_PAYLOAD`, `USER_BLOCKED`, `DOCTOR_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED` |
| `GIFT_DONE` | Field Activity | The assigned MR marks an Admin-allocated gift given: `PENDING` → `DONE` in one conditional update. Payload `{ giftId }` | `INVALID_PAYLOAD`, `USER_BLOCKED`, `GIFT_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED`, `GIFT_ALREADY_DONE` |
| `MONTHLY_STOCK` | Sales | One outlet's opening and closing counts for a month, several Products: `{ outletType, outletId, month, lines: [{ productId, openingQty, closingQty }] }`. Overwrites the same outlet + product + month. Refused after the month's last day (plus `MONTHLY_STOCK_GRACE_DAYS`) unless Admin unlocked it | `INVALID_PAYLOAD`, `OUTLET_NOT_FOUND`, `OUTLET_NOT_YOURS`, `PRODUCT_NOT_FOUND`, `MONTH_NOT_STARTED`, `MONTH_CLOSED` |
| `ORDER` | Sales | A Chemist or Distributor order: `{ outletType, outletId, orderDate?, remarks?, lines: [{ productId, quantity, unitPricePaise }] }`. The server works out each amount and the total, and echoes `totalAmountPaise` back. Stored `PLACED`; completing or cancelling needs a connection | `INVALID_PAYLOAD`, `OUTLET_NOT_FOUND`, `OUTLET_NOT_YOURS`, `PRODUCT_NOT_FOUND`, `ORDER_DATE_IN_FUTURE`, `AMOUNT_TOO_LARGE` |

Phase 6 adds the calls, follow-ups, expenses, orders, gifts and services. Payload
fields for `NEW_DOCTOR`: `routeId`, `category`, `name`, `address`, `specialty`, `qualification`,
`email` (optional) and `location` `{ latitude, longitude }` — the same rules as the direct endpoint.

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
source (G2), not a row-level delta: a delta can't see a Doctor *appearing* because an MR regained a
Route (the Doctor row didn't change) or *disappearing* because they lost one, and an MR's set is a few
hundred rows, so a snapshot is cheap and cannot drift.

```
GET /api/sync/pull?v[fieldMasterData]=<version>&v[hr]=<version>&only=hr,territory
```

`v[<source>]` is the version the phone holds for that source (none on a first pull); `only` narrows
the sources (default: all). The answer:

```jsonc
{ "serverTime": "2026-10-05T12:00:00.000Z",
  "sources": {
    "config":         { "version": "<sha1>", "unchanged": true },
    "fieldMasterData": { "version": "<sha1>", "data": { … } },
    "hr":             { "error": { "code": "SOURCE_UNAVAILABLE", "message": "…" } } } }
```

- **A version** is the SHA-1 of the snapshot's canonical JSON (keys sorted, dates as ISO text), so it is
  equal exactly when the content is. An equal version gets `unchanged` and no data; anything else —
  including a made-up one — gets the whole snapshot. A malformed version is a 400, an unknown source a 400
  that lists the real ones.
- **A source that fails is reported for that source alone** (`SOURCE_UNAVAILABLE`, logged in full); the
  rest still refresh. `serverTime` lets the phone tell how far its own clock is off.
- **Scoped to the caller.** The user comes from the token and each source is asked only about them.
  Nothing of another MR's — a Doctor, a Chemist, a holiday of another HQ — appears in the response.
- **Deterministic.** A source must give the same snapshot for the same data: lists sorted by a stable key,
  and nothing that changes on its own. That is what lets a Route lost and regained bring the phone back to
  *exactly* the version it held before — checked live.

| Source | Registered by | Contents |
|---|---|---|
| `fieldMasterData` | Field Master Data | `doctors` (the MR's own, by the `GET /doctors/mine` rule, Route-following included), `pendingDoctors` (the ones they added, awaiting approval), `chemists` (active, on their Routes), `distributors` (active; assigned to them or on their Routes), `products` (the active catalog), `sampleAllocations` (what's left, for exactly those Doctors) |
| `territory` | the composition root | their Routes (name, HQ, route type, distance, TA rate override in paise) and their HQ and Zone by name |
| `hr` | HR | active leave types, their balances for the current leave year, the holidays that apply to them across it (National, their HQ's, its Zone's), the weekly off day and the backdating limit |
| `fieldActivity` | Field Activity | whether they are compliance-blocked; their last week's daily reports (from six days back to today, oldest first) each with status, approval request id, call and follow-up counts and the day's money in paise (TA, DA, other expenses, how much is paid); their Doctor Services (newest 100) with status; the gifts for their Doctors still to give. Not the calls themselves, geofence results or anyone else's |
| `planning` | Planning | their Daily Plans from a week back to 30 days ahead and this and next month's Monthly Plans, each with its approval status (for the day's gate, a UX check — the server's is the real one), and `planOffDays`: this and next month's days locked on the Monthly Plan (weekly off, holidays of the main HQ) |
| `config` | the composition root | an allow-list of settings the app needs offline: the timezone, the Plan cutoffs, the calendar, the geofence radius and accuracy limit, and the sync limits it obeys |

Only what the app needs is included: no assignment history, no capture point, no approval internals.
Saving and submitting Plans and Leave requests need a connection and aren't synced.

**Why the composition root wires two of them:** a module may import contracts only from tiers *below*
its own, and Sync sits at Territory's tier and above Config's, so neither can register with it. Field
Master Data, HR and Planning are tier 3 and register their own; `apps/api/src/syncSources.ts` builds the
other two from their public contracts — composition, not logic.

**Cost.** Every source is read on every pull, even when nothing changed, because the version is a hash
of the snapshot. Measured against the remote dev cluster, a full pull took about 2 s (five sources at the time, before `fieldActivity`, about
a dozen queries); an all-`unchanged` reply is under 1 KB. Compression is the reverse proxy's job. If pulls
ever cost too much, a per-source change token would let an unchanged source skip its reads.

## Geofencing

A pure function in `shared/`, used by Field Activity (Phase 6) for every Doctor and Chemist Call:

```
evaluateGeofence({ registered, captured, accuracyMeters, radiusMeters, maxAccuracyMeters })
  → { status: "PASS" | "FAIL" | "UNVERIFIED", distanceMeters | null, reason | null }
```

- **`PASS` / `FAIL`** — the haversine distance between the captured point and the registered one,
  against `GEO_FENCE_RADIUS_METERS` (SystemConfig, seeded `100`, matching the client's document; Admin can change it —
  sign-off C5). A `FAIL` **is refused** `NOT_AT_LOCATION` and nothing is stored (decision-log 2026-10-12; the earlier "flags, doesn't block", HLD 01 §2.3, no longer applies).
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

`apps/api/src/modules/sync`, **tier 2** beside Approval: a registry that knows no record kind and no
data source until its owner registers one, so it imports only Identity (to check the caller) and Config
(its limits). It also owns the receipt and draft collections. Field Master Data registers the
`NEW_DOCTOR` handler and its pull source; HR and Planning register their pull sources; Territory's and
Config's are wired from the composition root (*Pull*). Field Activity registers `fieldActivity`. Phase 6 adds the calls, expenses, orders, gifts,
services and the DCR submit.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `PUT` | `/api/sync/drafts` | FIELD | Back up the day's unsent records (private, unvalidated, last write wins) |
| `GET` | `/api/sync/drafts` | FIELD | Restore them, e.g. on a new phone — paged by cursor |
| `POST` | `/api/sync/push` | FIELD | Submit: commit the day's records, with a result per record. A body over 2 MB is a 413, malformed JSON a 400 |
| `GET` | `/api/sync/pull` | FIELD | The MR's reference data, as versioned snapshots |

## Config

`GEO_FENCE_RADIUS_METERS` (100), `GEO_MAX_ACCURACY_METERS` (100), `SYNC_MAX_BATCH` (100),
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

## The shared contract, and how the protocol is tested

**`packages/contracts`** (`sync.ts`, `geofence.ts`) holds the wire format — the push, draft and pull
requests and responses, the six pull snapshots, the `NEW_DOCTOR` payload and every status and reason
code — so the phone and the API are built against one definition. `apps/api` builds against it: each
pull source's `snapshot()` is compiled against its contract type, and a conformance test
(`interface/sync.contract.test.ts`, `newDoctorSync.contract.test.ts`) fails the build if a response type
drifts from its contract or the server stops accepting what the contract says a phone may send. Dates on
the wire are ISO strings and money is paise.

**The phone simulator** (`interface/phoneSimulator.ts`) is a fake phone that follows the protocol —
local records, backup whenever there is a connection, a chunked Submit with the DCR's own submit last,
retry, restore on another phone — against the real engine, with the connection dropped *before* and
*after* the server has acted (the reply lost, so the phone can't tell). Its tests
(`interface/phone.simulation.test.ts`) prove, among others: a lost reply never doubles a record and ends
in exactly the state a clean run would; a day bigger than a chunk survives drops between chunks; a refused
record keeps the day from being submitted and a fix plus another Submit finishes it; a lost phone is
restored on another from the backup and an old copy resurfacing changes nothing; two phones editing one
record settle on the later edit; a phone with the wrong clock gets a reason it can show and can fix it —
and **30 seeded random days** over a randomly failing connection each converge on every record exactly
once, the DCR committed last, nothing doubled and no draft left. Breaking the engine's idempotency on
purpose fails 34 of them, so they do bite.

## Deliberately deferred

- A draft **visible to the manager** before Submit (a live view of the MR's day). Drafts are private
  by design (G9); anything the manager can see is a submitted report.
- Attachments and receipt photos, if the client wants them for Expenses (sign-off F2).
- Row-level delta pull, if a source ever grows too large to send whole.
