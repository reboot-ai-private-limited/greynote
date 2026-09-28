# Field Activity

The daily operational core of the field-force app: `DCR`, the calls and followups it bundles,
Expenses (both MR-logged and system-computed TA/DA), the approval-routed Doctor Service, and the
Admin-issued Doctor Gift (PRD §6.2 A/B, §7.2–7.3; ERD Module 4). Everything else in the mobile
app's Home tab exists to feed this module or to be gated by it.

This is the largest phase in [`../roadmap.md`](../roadmap.md) (phase 6) and the one every other
cross-cutting mechanism in the HLD converges on: Approval (`hld/05`), Offline Sync & Geofencing
(`hld/01`), TA/DA Auto-Calculation (`hld/06`), and Submission Gating (`hld/10`) all have Field
Activity as their first, and in most cases only, real consumer.

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
  // Payroll (tier 5) sums PAID TA/DA for a user across a month. Only PAID rows count —
  // MANAGER_APPROVED alone is not enough (see "Write-path rules" below).
  getPaidTaDaTotal(userId: string, month: string): Promise<{ taTotal: Decimal; daTotal: Decimal }>;

  // The missed-DCR compliance job (hld/10 §2) needs to know whether a DCR exists in a
  // qualifying status for a given user+date, without reaching into the collection directly.
  hasQualifyingDcr(userId: string, date: string): Promise<boolean>;

  // Reports (DCR Report, Gift & Sales Report — PRD §6.3) read through this contract rather than
  // a report-specific query layer, at least until a dedicated reporting module is warranted.
  getDcrSummary(userId: string, dateRange: DateRange): Promise<DcrSummary[]>;
}
```

`Decimal` here is a placeholder for whatever [`../engineering/coding-standards.md#money`](../engineering/coding-standards.md#money)
settles on — not yet decided; do not ship this contract with a `number` return type for money.

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
  day's Area type (`HQ`/`EX_STATION`/`OUT_STATION`, read via Territory's `getRoutePath`). One
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
- **Final Submission is one sync aggregate**, not five independent pushes racing each other —
  Dr Calls, Chemist Calls, Followups, added Doctors, and Expenses for the day all move to
  `QUEUED`/sync together, and (per the offline-sync section above) require connectivity at the
  moment of the tap.

## HTTP surface

All under `/api/field-activity`, scoped by the authenticated user's role.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/dcr` | FIELD | Create/get today's `DCR` envelope (idempotent per user+date) |
| `POST` | `/dcr/:id/doctor-calls` | FIELD | Log a Dr Call (gated on plan approval) |
| `POST` | `/dcr/:id/chemist-calls` | FIELD | Log a Chemist Call (gated) |
| `POST` | `/dcr/:id/doctor-followups` | FIELD | Log a Dr Followup (gated) |
| `POST` | `/dcr/:id/chemist-followups` | FIELD | Log a Chemist Followup (gated) |
| `POST` | `/dcr/:id/expenses` | FIELD | Log a MANUAL expense (gated) |
| `POST` | `/dcr/:id/submit` | FIELD | Final Submission — requires connectivity, rejected while `is_blocked` |
| `POST` | `/dcr/:id/review` | FIELD (manager) | Approve/reject; approval triggers AUTO TA/DA generation |
| `GET` | `/dcr` | FIELD, ADMIN | List/history (Team tab read-only visibility per PRD §7.1 applies here) |
| `POST` | `/doctor-services` | FIELD | Request a service (routed to approval engine) |
| `POST` | `/doctor-services/:id/review` | FIELD (manager) | Approve/reject |
| `POST` | `/admin/doctor-services` | ADMIN | Admin-created, auto-approved |
| `POST` | `/admin/doctor-gifts` | ADMIN | Allocate a gift |
| `POST` | `/doctor-gifts/:id/complete` | FIELD | Mark a gift `DONE` |
| `POST` | `/expenses/:id/mark-paid` | ACCOUNTANT | Settlement step, independent of DCR approval |

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

- The exact API/UI shape for a manager setting `geofence_status = FAIL → OVERRIDE` during DCR
  review — the state exists in the ERD, `hld/01` describes the judgment call but not the
  mechanism; design this when building the review endpoint, not before.
- A `DailyPlan`-vs-`DCR` adherence report (did the MR actually visit what they planned) — the ERD
  explicitly keeps `DailyPlan` and `DCR` unlinked for now (ERD Module 5's note); revisit only if
  that reporting need is confirmed.
- Any reporting module beyond the minimal `getDcrSummary` on this module's own contract — a
  dedicated reporting/analytics layer is out of scope for the first build.
