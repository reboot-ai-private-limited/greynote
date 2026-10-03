# Field Activity

The daily operational core of the field-force app: `DCR`, the calls and followups it bundles,
Expenses (both MR-logged and system-computed TA/DA), the approval-routed Doctor Service, and the
Admin-issued Doctor Gift (PRD §6.2 A/B, §7.2–7.3; ERD Module 4). Everything else in the mobile
app's Home tab exists to feed this module or to be gated by it.

This is the largest phase in [`../roadmap.md`](../roadmap.md) (phase 6) and the one every other
cross-cutting mechanism in the HLD converges on: Approval (`hld/05`), Offline Sync & Geofencing
(`hld/01`), TA/DA Auto-Calculation (`hld/06`), and Submission Gating (`hld/10`) all have Field
Activity as their first, and in most cases only, real consumer.

## Build status

**Complete** (Phase 6 Field Activity steps 1–11, `../roadmap.md`; the full day was run end to end against the dev database on 2026-09-29). What is built: the decisions below, the **DCR envelope**
and the **logging gate**, the DCR's **Final Submission** as the sync kind `DCR_SUBMIT`, reads of DCRs,
`hasQualifyingDcr` on the contract, and **calls, follow-ups and samples given** as four sync kinds, and
**manual expenses** as the sync kind `EXPENSE`. **the geofence override** for the manager's review (approve / reject is the approval module's). **TA/DA generation and its cancellation**. **Doctor Services and Gifts**. **the Accountant's list and mark-paid**, and the contract's **`getPaidTaDaTotal` / `getDcrSummary`**. **the missed-DCR compliance job**. **the `fieldActivity` pull source**.

- **The DCR** (`Dcr`: `userId`, `reportDate`) is one row per user per day — a unique index — created lazily
  by the first record of the day or by the submit, in one atomic upsert, so simultaneous first records (two
  phones, two pushes) share one envelope. It has no status of its own: it is `DRAFT` until it has a `DCR`
  approval request (Employee → Manager → Admin), then that request's status.
- **The gate** (`LoggingGate`) is the one check every write of the day goes through, in this order: the
  employee isn't compliance-blocked (`USER_BLOCKED`); the day isn't in the future (`DATE_IN_FUTURE`) and is
  the day the record was made — `clientCreatedAt` read in `BUSINESS_TIMEZONE`, so a record made at 00:30 IST
  on the 6th belongs to the 6th though it is still the 5th in UTC (`DATE_MISMATCH`); the day's Plan is past
  the manager, asked of Planning's `isDailyPlanApproved` and never compared here
  (`DAILY_PLAN_NOT_APPROVED`) — the server's answer, whatever the phone's cache believed; and the day's DCR
  isn't already sent (`DCR_LOCKED`; a rejected, withdrawn or reopened one can be added to again). Each is a
  `GateRefusal` carrying that code, which the sync handlers turn into the record's `reason`.
- **`DCR_SUBMIT`** is the last record of the day's push and `dependsOn` all the others, so it only runs when
  every record before it applied. It goes through the same gate, creates the envelope if the day had no calls
  (a meeting day is a valid report), and submits the `DCR` request in the sync engine's transaction; the
  record's `serverId` is the DCR's id. Resubmitting after a rejection is a new cycle on the same request.
  Payload: `{ "reportDate": "YYYY-MM-DD" }`.
- **Reads:** `GET /dcr?from&to` (an employee's own; Admin names `userId`), `GET /dcr/team?from&to[&userId]`
  (a manager's downline, read-only) and `GET /dcr/:id` (owner, their managers, Admin), each DCR with its status
  and approval summary; `:id` also returns the day's calls and follow-ups with Doctor, Chemist and product
  names and the geofence flags — the manager's review screen. Approving is `/api/approvals/*` with `kind=DCR`.
- **Calls, follow-ups and samples (step 3)** are the sync kinds `DOCTOR_CALL`, `CHEMIST_CALL`,
  `DOCTOR_FOLLOWUP` and `CHEMIST_FOLLOWUP`, each through the gate and stored on the day's DCR, unique on
  (`userId`, `clientId`). Beyond the gate the server re-checks what the phone's cache may have gone stale on:
  the Doctor is active and still assigned to the MR (`DOCTOR_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED`); the Chemist is
  active and on a Route the MR still has (`CHEMIST_NOT_FOUND`, `CHEMIST_ROUTE_NOT_ASSIGNED`); every `workWith`
  is someone else (`INVALID_WORK_WITH`). The phone sends `capturedLocation` (nullable) and `accuracyMeters`;
  the **server** decides `PASS` / `FAIL` / `UNVERIFIED` with the radius and accuracy read from System Config on
  every call, stores it, and echoes it as the record's `data.geofence` (replayed unchanged on `ALREADY_SYNCED`).
  A `FAIL` is flagged for the manager, never refused. No GPS reading at all is `UNVERIFIED / NO_GPS_READING`.
  A Doctor call may carry `samples`: each line draws the Doctor's allocation down atomically
  (`decrementRemaining`), inside the record's transaction, so a line that cannot be met (`SAMPLES_EXHAUSTED`,
  saying how many remain; `NO_SAMPLE_ALLOCATION`) undoes the whole call including earlier lines; simultaneous
  calls can never take the allocation below zero.
- **Manual expenses (step 4)** are the sync kind `EXPENSE`, payload `{ reportDate, type, amountPaise, remarks? }`
  with `type` one of `TRAVEL`, `MEAL`, `MISC` and the amount a whole number of paise above zero. It goes through
  the same gate, is stored `source: MANUAL`, `paymentStatus: UNPAID`, unique on (`userId`, `clientId`), and shows
  in `GET /dcr/:id` as `expenses`. `TA` and `DA` are refused as `INVALID_PAYLOAD`: the server alone computes
  them (step 6). The `Expense` row already carries the AUTO fields (`routeId`, `distanceFlag`) and
  `paidBy`/`paidAt`, so steps 6 and 8 add behaviour, not schema. The DCR submit's `dependsOn` already covers
  every record kind, expenses included, so a day with a refused expense is not submitted.
- **TA/DA (step 6)** is written by the DCR approval kind's `onStatusChange`, inside the approval's own
  transaction, so the status change and the rows commit together or not at all. Past the manager
  (`MANAGER_APPROVED`, or `APPROVED` for a top-of-chain submitter or an Admin override) and only if the DCR has no
  live `AUTO` rows yet, it reads the day's Plan (Planning's new `getDailyPlanDay`: working type and routes, with
  an approved in-day change already in it), each Route (Territory's `getRoute`) and the Pay Band (Identity's
  `getPayBandRates`), and writes `AUTO`, `UNPAID` rows — never from anything the phone sent. The rules are
  `application/taDaCalculator.ts`: `FIELD_WORK` gets **one TA row per Route** (distance × the Route's own rate, else
  the Pay Band's, rounded half up once per Route) and one DA row at the highest Route type of the day;
  `MEETING`/`CONFERENCE` get DA at the HQ rate; `STRIKE` nothing. A Route whose distance isn't `CALCULATED` (or is
  unknown) gets a zero TA row with `distanceFlag`, and approval goes through. A zero DA (a grade's ₹0 HQ rate) is
  not written. No Plan for the day → no rows. When the DCR goes back (`REJECTED` by Admin at the final stage,
  `REOPENED`, `WITHDRAWN`) its `UNPAID` `AUTO` rows become `CANCELLED` and a `PAID` one is left; approval after a
  resubmission writes fresh rows and the cancelled ones stay as history. `MANUAL` rows are never touched. The
  amounts are a snapshot: changing a Route's distance or a rate afterwards doesn't reach an approved row.
- **Doctor Services and Gifts (step 7)** are not children of the day's DCR (the ERD gives them no `dcrId`), so
  neither needs the day's Plan; both refuse a compliance-blocked MR (`USER_BLOCKED`).
  - **Doctor Service.** The sync kind `DOCTOR_SERVICE`, payload `{ doctorId, serviceType, amountPaise, remarks? }`,
    `serviceType` one of `TOUR_PACKAGE`, `GIFT`, `ONLINE_PROMOTION`, `OTHERS` (H4), whole paise above zero. The Doctor
    must be an active one the MR is still assigned to (`DOCTOR_NOT_FOUND` / `DOCTOR_NOT_ASSIGNED`). It is stored and
    submitted as a `DOCTOR_SERVICE` approval request (Employee → Manager → Admin) in the engine's transaction; its
    status is the request's, not stored. Admin's `POST /admin/doctor-services` (same fields) creates one with no
    request — effective at once, `origin: ADMIN`, shown as `APPROVED` — tied to the Doctor's assigned MR at that
    moment, read from Field Master Data's new `getAssignedUserId`; a Doctor with no assigned MR is a 409.
    `GET /doctor-services` is the MR's own (Admin: everyone's, or `userId` / `doctorId`), each with the Doctor's name,
    status and approval ids.
  - **Doctor Gift.** Admin's `POST /admin/doctor-gifts` `{ doctorId, productName, amountPaise }` creates it `PENDING`,
    with no MR named and no approval. The MR marks it done with the sync kind `GIFT_DONE` `{ giftId }`, allowed for
    whoever is assigned to that Doctor *when the record is applied*, so a Doctor reassigned in between hands its
    gifts to the new MR (the old one gets `DOCTOR_NOT_ASSIGNED`). One conditional update (`PENDING` → `DONE`, with
    who and the phone's time) — a second attempt, even by the same MR, is `GIFT_ALREADY_DONE`; an unknown gift is
    `GIFT_NOT_FOUND`. `GET /doctor-gifts` is the gifts of the MR's own Doctors (Admin: all), filterable by status.
- **The Accountant (step 8).** An `Expense` carries `accepted`: true while its DCR stands past the manager, set
  and cleared by the DCR approval hook (computed rows are written already accepted; the MR's manual rows flip
  with the DCR; a `PAID` row keeps what it was). `GET /expenses?from&to[&userId][&paymentStatus]` (ACCOUNTANT,
  ADMIN; the range is required, at most 400 days, at most 500 rows) lists the accepted rows, `UNPAID` first then
  `PAID`, oldest day first, with the employee's name and code and the `distanceFlag`.
  `POST /expenses/:id/mark-paid` is one conditional update (accepted and `UNPAID` → `PAID`, with `paidBy` and
  `paidAt`). Marking a paid one again returns it unchanged — the first payer and time stay, however many retries or
  simultaneous clicks; a `CANCELLED` row, or one whose DCR isn't accepted, is 409; an unknown id 404. Because
  `accepted` is in the update's filter, a payment can't slip past a rejection that commits first.
- **Contract (step 8).** `getPaidTaDaTotal(userId, 'YYYY-MM')` → `{ taPaise, daPaise, reimbursementPaise }`: what was `PAID`
  **during** that month (by `paid_at` in the business timezone, not by report day — decision-log 2026-09-30: an expense
  reported in September and paid on 3 October belongs to October's payroll, so a late payment is never orphaned) — TA, DA, and the manual expenses (travel, meals, other) as `reimbursementPaise` —
  so Payroll can show them apart and add them to the net pay with the base salary less the leave deduction (hld/07). `getDcrSummary(userId, { from, to })` → per DCR `{ dcrId, userId, reportDate, status,
  doctorCalls, chemistCalls, followups, taPaise, daPaise, otherExpensesPaise, paidPaise }`, `CANCELLED` rows left
  out, in a fixed handful of queries however many days.
- **Pull source (step 10).** `fieldActivity` (`sync.md`, *Pull*), scoped to the caller: `blocked`, `today`, the
  last seven days' `dcrs` (status, approval request id, counts, TA / DA / other / paid in paise), `doctorServices`
  (newest 100, with status) and `pendingGifts`. Typed as `FieldActivitySnapshot` in `packages/contracts`. It is a
  snapshot with a version like the others: deterministic, so it reports `unchanged` until a status, amount or gift
  actually changes. `getDcrSummary` gained `approvalRequestId` for it.
- **Contract:** `hasQualifyingDcr(userId, date)` — true once `SUBMITTED`, `MANAGER_APPROVED` or `APPROVED`.

## What it owns

Full fields in [`../erd/04-field-activity.md`](../erd/04-field-activity.md).

- **`DCR`** — the daily envelope. One row per user per `report_date`, that every child below
  attaches under. Its two-stage approval is a `DCR` `ApprovalRequest` in the `approval` module
  ([`approval.md`](approval.md)), not fields on this row (an earlier draft stored them here).
- **`DoctorCall`** / **`ChemistCall`** — `working_type`, `work_with`, remarks, captured GPS
  (`captured_latitude`/`captured_longitude`), and `geofence_status` (`PASS`/`FAIL`/`OVERRIDE`).
- **`DoctorSampleGiven`** — one row per product+quantity given during a `DoctorCall`, each
  drawing down a `DoctorSampleAllocation` (Field Master Data).
- **`DoctorFollowup`** / **`ChemistFollowup`** — remarks only, attached to the day's `DCR`.
- **`Expense`** — `type` (`TA`/`DA`/`TRAVEL`/`MEAL`/`MISC`), `source` (`AUTO`/`MANUAL`),
  `amount`, and a `payment_status` (`UNPAID`/`PAID`) that is **separate from `DCR`'s approval
  status** — approval means the claim is accepted; `payment_status` is the Accountant's later
  settlement step.
- **`DoctorService`** — MR-requested (or Admin-created) service request against a doctor
  (`service_type`, `amount`), routed through the shared approval engine.
- **`DoctorGift`** — Admin-issued allocation the assigned MR marks `DONE`. No approval step; not
  the same thing as a `DoctorService` with `service_type: GIFT`, which is a bigger-ticket,
  approval-routed request.

## Public contract

`FieldActivityPublicContract`, following the shape `health.public.ts` establishes (one interface,
async methods, no framework types leaking through):

```ts
interface FieldActivityPublicContract {
  // Payroll (tier 5) sums TA/DA PAID for a user during a month (by paid date). Only PAID rows count —
  // MANAGER_APPROVED alone is not enough (see "Write-path rules" below).
  getPaidTaDaTotal(userId: string, month: string): Promise<{ taPaise: number; daPaise: number; reimbursementPaise: number }>;

  // The missed-DCR compliance job (hld/10 §2) needs to know whether a DCR exists in a
  // qualifying status for a given user+date, without reaching into the collection directly.
  hasQualifyingDcr(userId: string, date: string): Promise<boolean>;

  // Reports (DCR Report, Gift & Sales Report — PRD §6.3) read through this contract rather than
  // a report-specific query layer, at least until a dedicated reporting module is warranted.
  getDcrSummary(userId: string, range: { from: string; to: string }): Promise<DcrSummary[]>;
}
```

Money is a whole number of **paise** — a plain integer
(decided 2026-09-29; [`../engineering/coding-standards.md#money`](../engineering/coding-standards.md#money)),
named `…Paise`.

What it does **not** expose: nothing about `geofence_status`, `working_type`, or the write paths
below. Those are internal to how a DCR gets created and approved, not something another module
needs to call into.

## Submission gating

Per PRD §6.2 A and [`hld/10-submission-gating-and-compliance-block.md`](../hld/10-submission-gating-and-compliance-block.md)
§1, an MR cannot create `DoctorCall`, `ChemistCall`, `DoctorFollowup`, `ChemistFollowup`, or
`Expense` for a `report_date` until that date's `DailyPlan` (Planning module) is past the
manager's stage — `MANAGER_APPROVED` or `APPROVED`. **The gate lives here, in Field Activity's use cases — it is this module
consuming Planning's contract, not something Planning enforces on Field Activity's behalf.**

Every write use case in this module (`CreateDoctorCall`, `CreateExpense`, …) starts with:

```
await Planning.contract.isDailyPlanApproved(userId, reportDate)
```

and rejects otherwise. Never compare against a single status here: which statuses count as
approved is Planning's rule ([`planning.md`](planning.md) § Public contract), and a top-of-chain
MR, an Admin override or a `MANAGER_ONLY` Daily Plan all land on `APPROVED`, not `MANAGER_APPROVED`. The mobile app also checks this client-side against the locally-synced
`DailyPlan` status (a UX gate, not a security boundary — `hld/01` §1.1's reference-data cache can
be stale, e.g. a manager rejected the plan after the device's last sync), so the server check is
the one that's authoritative.

The second half of `hld/10` — the missed-DCR compliance block (`is_blocked`, Identity) — is
**not** this module's write-path check to make; it's Identity's `is_blocked` flag, which this
module's use cases also check before allowing a write, alongside the plan-approval gate above.
Clearing the block is Admin-only and happens in Identity, not here.

## Offline sync & geofencing

This module doesn't implement its own offline queue or GPS-distance check — both are the shared
mechanism in [`hld/01-sync-and-geofencing.md`](../hld/01-sync-and-geofencing.md), and Field
Activity is its first real consumer (`docs/roadmap.md` builds `hld/01` as its own phase 5,
specifically before this phase, for that reason). What's specific to this module:

- `DCR` and every child below it are transactional records per `hld/01` §1.1: client-generated
  UUID, local `sync_status` (`DRAFT → QUEUED → SYNCED/FAILED`), pushed in dependency order (the
  `DCR` envelope before its children) and idempotent on that UUID at the server.
- `DoctorCall`/`ChemistCall` run the geofence check on-device first (`hld/01` §2.2) using the
  cached registered coordinates from Field Master Data, then the server **recomputes and can
  overwrite** `geofence_status` at sync time — the server's answer is authoritative over a
  possibly-stale or spoofed device value.
- A `FAIL` **does not block submission** (`hld/01` §2.3) — it saves normally with
  `geofence_status = FAIL`, visible to the Nearest Manager during DCR review alongside the call's
  remarks. `OVERRIDE` (the third `geofence_status` value the ERD carries) is how that manager's
  judgment call gets recorded on the specific call row — this module's DCR-review use case is
  where `FAIL → OVERRIDE` happens; nothing in `hld/01` or the ERD specifies a UI or API shape for
  it beyond the state existing, so this is a genuine open item for whoever implements this
  module's approval-review endpoint to close, not something to invent silently.
- `DCR` Final Submission requires a **live connection at tap time**, same carve-out as
  `DailyPlan`/`MonthlyPlan` Submit (`hld/01` §1.2) — individual calls/expenses can queue offline,
  but the Final Submission action itself cannot, because it's what the missed-DCR compliance job
  keys off of (`hld/10` §2).

## TA/DA auto-calculation

Summarized here at LLD depth; the full algorithm and its edge cases are
[`hld/06-ta-da-auto-calculation.md`](../hld/06-ta-da-auto-calculation.md) — read that before
implementing, don't re-derive it from this summary alone.

- **Trigger is DCR approval, not submission.** When the Nearest Manager transitions a `DCR`
  `SUBMITTED → MANAGER_APPROVED`, this module's use case reads that day's `DailyPlan`
  (`working_type`, `route_ids`) from Planning's contract and the approving-for user's `PayBand`
  from Identity's contract.
- **TA** (`FIELD_WORK` only) = `sum(route.distance_km where distance_status == CALCULATED) ×
  pay_band.ta_per_km_rate`, reading `Route.distance_km` through Territory's contract as it stands
  at approval time — Territory keeps that figure current on every waypoint edit
  ([`territory.md`](territory.md)); Field Activity only reads it, never recomputes or freezes it.
- **DA** (`FIELD_WORK`, `MEETING`, `CONFERENCE` — not `STRIKE`) = the pay band's DA rate for the
  day's Route type (`HQ`/`EX_STATION`/`OUT_STATION`, read via Territory's `getRoutePath`). One
  amount per day, not per route. Full rule and tie-breaks in
  [`../hld/06-ta-da-auto-calculation.md`](../hld/06-ta-da-auto-calculation.md) §2.
- Both are created as `source: AUTO` `Expense` rows on that `DCR`. **Never trust a client-supplied
  amount for these** — the server always computes them itself.
- Generation happens **exactly once per DCR** (tied to the one-way `SUBMITTED →
  MANAGER_APPROVED` transition); a rejected-then-resubmitted `DCR` goes through the same
  one-time trigger on its next approval, not a second one layered on the first.

## Write-path rules & invariants

- **`DoctorService` goes through the `approval` module** ([`approval.md`](approval.md)) exactly
  like `DCR` and Planning's Plans — an MR-submitted Service is submitted as a `DOCTOR_SERVICE`
  request. Admin-created rows skip approval entirely (no request is created; the Service is
  effective immediately) with the covering MR auto-selected from that doctor's
  `DoctorAssignment` (Field Master Data).
- **`DoctorGift` never touches the approval engine.** Admin allocates it directly; the assigned
  MR's only action is `PENDING → DONE`.
- **`Expense.payment_status` is independent of `DCR.status`.** A `MANAGER_APPROVED` DCR's
  expenses start `UNPAID`; only the Accountant's later "mark paid" action
  (`paid_by`/`paid_at`) sets `PAID`. Payroll's contract call
  (`getPaidTaDaTotal`) filters on `payment_status == PAID`, never on `DCR.status` alone — an
  approved-but-unpaid claim must not count toward a payroll run.
- **`DoctorSampleGiven` decrements `DoctorSampleAllocation.quantity_remaining`** — application
  logic in this module's use case, calling Field Master Data's contract (not a schema-level
  constraint, per the ERD's own note); reject the call write if the allocation can't cover the
  quantity requested, rather than allowing a negative remaining balance.
- **Final Submission is the last record of the day's push** (`sync.md`, *Push*): a `DCR_SUBMIT`
  record that `dependsOn` every other record of the day. If any of them failed it is `FAILED` with
  `DEPENDENCY_FAILED` and the DCR is not submitted — the MR fixes the failures and taps Submit again,
  and what already synced is `ALREADY_SYNCED`. It needs a live connection at the tap, like every push.

## Write path and HTTP surface

**Records reach the server through the sync push, not through a POST each** (sign-off G1; `sync.md`).
The calls, follow-ups, expenses, Doctor Services, Gifts marked done and the DCR's own submit are
registered as sync record kinds and arrive together at the daily report's Submit; the per-record
`POST /dcr/:id/doctor-calls`-style endpoints this LLD first listed are not built. What stays as REST is
what needs a live connection or a role other than the MR's, all under `/api/field-activity`:

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/dcr` | FIELD (own), ADMIN (names `userId`) | List and history of DCRs, each with its status |
| `GET` | `/dcr/team` | FIELD (managers) | The downline's DCRs, read-only |
| `GET` | `/dcr/:id` | FIELD (owner, managers), ADMIN | One DCR with its calls, follow-ups and expenses — the manager's review screen, geofence flags included |
| `POST` | `/dcr/:id/calls/:callId/override-geofence` | FIELD (the reviewing manager), ADMIN | Accept a `FAIL` / `UNVERIFIED` call (below) |
| — | `/api/approvals/*` with `kind=DCR` | Manager, Admin | Approve / reject / withdraw the DCR — the approval module's endpoints |
| `POST` | `/admin/doctor-services` | ADMIN | An Admin-created Doctor Service, effective at once |
| `POST` | `/admin/doctor-gifts` | ADMIN | Allocate a Gift to a Doctor |
| `GET` | `/doctor-services`, `/doctor-gifts` | FIELD (own), ADMIN | Lists |
| `GET` | `/doctor-services/:id` | FIELD, ADMIN | One Doctor Service by its own id (what an approval request's `recordId` points at). Admin reads any; an MR only their own, and anyone else gets the same `404` as an unknown id |
| `GET` | `/expenses` | ACCOUNTANT, ADMIN | The audit list: manager-approved expenses, unpaid first |
| `POST` | `/expenses/:id/mark-paid` | ACCOUNTANT, ADMIN | The settlement step, independent of the DCR's approval |

## Geofence override (decided 2026-09-29)

The server recomputes every call's `geofence_status` at sync from the Doctor's or Chemist's stored
location and `GEO_FENCE_RADIUS_METERS` (`sync.md`, *Geofencing*); its answer overwrites the phone's. A
`FAIL` or `UNVERIFIED` call is **flagged, never refused**, and the reviewing manager sees the flag next
to the call's remarks. To accept one, **the manager marks that call `OVERRIDE` with a required
comment** — `POST /dcr/:id/calls/:callId/override-geofence`. It's an action on the *call*, separate from
approving the DCR, so a manager can accept two flagged calls and still reject the day. It records who,
when and why (`geofenceOverriddenBy`, `…At`, `…Comment`), keeps the computed distance and original status,
and is allowed only on a `FAIL` / `UNVERIFIED` call of a DCR that is still `SUBMITTED` at the reviewing
manager's stage (Admin may do it at any stage). A `PASS` call has nothing to override.

**Built (step 5).** Body `{ comment }` (required, ≤ 500 characters); response `{ id, geofence }`. Who: the
employee's **nearest manager** while the DCR is `SUBMITTED`, and **Admin** while it is `SUBMITTED` or
`MANAGER_APPROVED`; anyone else — the owner, a manager higher up at the manager's stage, a stranger — is 403.
`409` when the DCR isn't under review (draft, rejected, withdrawn, fully approved), the call passed, or was
already accepted; `404` for a call that isn't on that DCR. The change is one conditional update
(`FAIL`/`UNVERIFIED` → `OVERRIDE`), so simultaneous accepts leave one winner. The original status is not stored
separately: it is recoverable from what stays — a `reason` means it was `UNVERIFIED`, none means `FAIL` — beside
the computed distance.

## When TA/DA is generated (decided 2026-09-29)

At the DCR's `SUBMITTED → MANAGER_APPROVED` transition, exactly once, from the day's Plan
(`hld/06`). If **Admin later rejects at the final stage** (or reopens the DCR), the `AUTO` expenses that are
still `UNPAID` are marked `CANCELLED` — they no longer count for anything — while any already `PAID` are left
alone and reported, since money has moved. A resubmitted DCR that reaches the manager stage again generates
fresh `AUTO` expenses. `MANUAL` expenses follow the DCR's approval but are never cancelled by this.

## The missed-DCR job (decided 2026-09-29, built in step 9)

The application has no scheduler, and this doesn't add one. The job (`hld/10` §2) is an **explicit script**,
`pnpm --filter @greynote/api compliance:run` (`node dist/scripts/run-compliance.js` in production), run
daily by the operator's cron after the day rolls over — the same model as `seed` and the money migration
(`manual_deploy.md`, step 10). `--dry-run` reports who would be blocked and blocks no one; `--user <id>`
limits the run; the exit code is 1 if any employee could not be checked.

`RunMissedDcrCheckUseCase` visits each active FIELD employee (Identity's `listActiveFieldUserIds`). It blocks
(`Identity.blockUser`, reason `DCR_MISSED_NO_LEAVE: no report for <dates>`) anyone who has **missed more than
`DCR_MISS_GRACE_DAYS` working days in a row, ending yesterday** (business timezone) — `0` blocks on the first
miss, the default `1` on the second. Walking back from yesterday, a day is:

- **reported** — a DCR that is `SUBMITTED`, `MANAGER_APPROVED` or `APPROVED` (sign-off B7's working assumption) —
  which ends the walk;
- **skipped**, neither counted nor breaking the run — the employee's weekly off or a holiday (HR's
  `listOffDates`), or covered by an approved Leave (`isOnLeave`);
- **out of scope**, which ends the walk — before the joining date, or before the day an Admin last cleared a
  block on them (Identity's `getLastBlockClearedAt`), so an unblocked employee starts clean instead of being
  re-blocked next morning for the same days;
- otherwise **missed**.

The walk looks back at most 31 days. It is **idempotent**: a blocked employee is skipped (and `blockUser`
answers "already blocked" if a race slipped through), so a double run, or a re-run after a failure part-way,
blocks no one twice. One employee's failure is recorded in the run's `failed` list and the rest are still checked.
It does nothing when `DCR_MISS_BLOCK_ENABLED` is `false`.

## Working assumptions for open client rows (sign-off group H)

Built without waiting, and revisited when the client answers: **manual expenses** carry no per-category
limit and no receipt (F2); **Doctor Service types** are the ERD's `TOUR_PACKAGE`, `GIFT`, `ONLINE_PROMOTION`,
`OTHERS` (C8); **Night Stay** allowance is not computed (D2); TA/DA on **holidays and weekly offs** is not
treated specially (D6); an MR's day **counts as reported when the DCR is submitted** (B7).

## Edge cases

- **A call logged outside the geofence radius** saves normally with `geofence_status = FAIL`,
  visible to the approving manager — never a hard rejection (`hld/01` §2.3).
- **A `DailyPlan` cached as approved on-device is actually not**, at sync time (manager rejected
  it after the last delta sync) — every gated write is rejected server-side even though the
  device let the MR fill the screen; see [`hld/10`](../hld/10-submission-gating-and-compliance-block.md) §1.
- **A route referenced by the day's plan has `distance_status != CALCULATED`** (Territory) — that
  route contributes zero to the TA sum rather than blocking DCR approval; the resulting `Expense`
  should carry a flag so the Accountant's audit doesn't mistake it for a legitimately short
  route (`hld/06` §4).
- **No `DailyPlan` exists for the approved DCR's date** — no `AUTO` TA row generates; DA still
  generates if a working type is resolvable some other way, but in practice a missing plan is a
  gap the Accountant's audit catches, not something this module fabricates a number for.
- **`is_blocked` becomes true mid-day** (missed-DCR compliance job runs overnight) — every gated
  write and the Final Submission itself are rejected until an Admin clears it; requesting Leave
  and viewing history both remain available.
- **A doctor's sample allocation runs out mid-submission** — the specific `DoctorSampleGiven` row
  fails at sync with its own reason (`hld/01` §1.3's per-record result), without failing the rest
  of that day's Final Submission batch.
- **A `DoctorAssignment` changes underneath a queued offline call** (Admin reassigns the doctor
  to a different MR while the original MR still has a call queued) — the server catches this at
  sync via Field Master Data's contract and rejects/flags the record rather than accepting a
  stale assumption (`hld/01` §1.4).

## Dependencies

- **Identity** — `PayBand` rates for TA/DA, `is_blocked` for the compliance gate, the manager
  hierarchy for approval routing.
- **Territory** — current `Route.distance_km` for TA, read at DCR-approval time.
- **Field Master Data** — Doctor/Chemist registered coordinates for geofencing,
  `DoctorAssignment` for the Team-tab visibility and Admin-service auto-selection,
  `DoctorSampleAllocation` for sample decrement.
- **Planning** — `DailyPlan.status`/`working_type`/`route_ids`, consumed both for the submission
  gate and for TA/DA generation.
- **Approval** (Tier 2, [`approval.md`](approval.md)) — for `DCR`, Expenses and `DoctorService`,
  not `DoctorGift`.
- **Offline Sync & Geofencing** (`hld/01`) — the transactional-record sync protocol and the
  on-device/server geofence check, both consumed rather than reimplemented.

## Deliberately deferred

- A `DailyPlan`-vs-`DCR` adherence report (did the MR actually visit what they planned) — the ERD
  explicitly keeps `DailyPlan` and `DCR` unlinked for now (ERD Module 5's note); revisit only if
  that reporting need is confirmed.
- Any reporting module beyond the minimal `getDcrSummary` on this module's own contract — a
  dedicated reporting/analytics layer is out of scope for the first build.
