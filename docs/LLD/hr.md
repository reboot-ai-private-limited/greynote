# HR

Leave and holiday administration for field-force employees — HR's slice of PRD §5.3 (leave
balances, approve/reject leaves, the Holiday Calendar) and §6.2.D (the mobile app's read-only
Holiday List). ERD: [`../erd/07-hr-ops.md`](../erd/07-hr-ops.md). Roadmap:
[`../roadmap.md`](../roadmap.md) phase 4, Tier 3.

## What it owns

- **`LeaveType`** — `CASUAL`, `SICK`, `EARNED`, `LOSS_OF_PAY`, … with a `is_paid` flag.
- **`LeavePolicy`** — the grade-wise Leave Master: default `default_allocated_days` per
  `(PayBand, LeaveType)` pair, HR-managed.
- **`LeaveBalance`** — the live, per-user, per-year ledger: `allocated_days` (seeded from
  `LeavePolicy`, independently HR-editable) and `used_days`.
- **`Leave`** — a request: `start_date`/`end_date`/`days_count`/`reason`, `status`
  and its approval — a `LEAVE` `ApprovalRequest` (Employee → Manager → HR or Admin) in the
  `approval` module, not `status`/`reviewed_by` fields on the row (see the superseded section
  below and [`approval.md`](approval.md)).
- **`Holiday`** (+ `HolidayZone`, `HolidayHQ` join tables) — a dated event scoped `NATIONAL`,
  `ZONE`, or `HQ`.

Full fields in [`../erd/07-hr-ops.md`](../erd/07-hr-ops.md).

## Public contract

`HrPublicContract`, shaped like every other module's (`<module>.public.ts` — see
[`../engineering/module-anatomy.md`](../engineering/module-anatomy.md), `health.public.ts` for
the minimal example this follows):

- **For Payroll (Tier 5, phase 7)** — the one real cross-module consumer: a lookup returning a
  user's total **unpaid**-leave days approved in a given month, for the payroll deduction PRD
  §5.3 describes ("Syncs approved unpaid leaves for deduction"). This reads `Leave.status =
  APPROVED` joined through `LeaveType.is_paid = false` — Payroll never touches `Leave` or
  `LeaveType` directly, it calls this one method.
- **For the mobile app / web portal** — Holiday List queries scoped by National/Zone/HQ, and
  leave-balance/leave-request reads for a given user. These are read paths a UI calls directly
  through this module's HTTP surface below, not cross-module contract calls.

Nothing in HR calls into another module at write time — `LeavePolicy` reads `PayBand` by
reference (an ID, resolved through Identity's contract when validating a policy row points at a
real Pay Band) and `Holiday` reads `Zone`/`HQ` the same way through Territory's contract, but HR
never reaches into either module's internals.

## Write-path rules & invariants

- **Grade-wise default, individually overridable.** `LeavePolicy` is the only place a
  `(PayBand, LeaveType)` default is set. When a user's Pay Band is assigned (Identity, Tier 1),
  their `LeaveBalance` row per `LeaveType` is **seeded** from the matching `LeavePolicy` row —
  a one-time copy, not a live reference. HR can then edit an individual's `allocated_days`
  directly (a one-off top-up); that edit does not propagate back to `LeavePolicy` and a later
  `LeavePolicy` change does not retroactively touch already-seeded balances. Get this direction
  right: policy → balance is a seed, not a foreign key.
- **`is_paid` lives on `LeaveType`, not on `Leave`.** Whether a specific leave request deducts
  pay is a property of which type it is, never of the individual request — so there is no
  "override this one leave to be unpaid" path; changing that means changing the employee's
  `LeaveType` selection before submission.
- **Holiday scope multiplicity.** `NATIONAL` applies with no join rows. `ZONE`/`HQ` use
  `HolidayZone`/`HolidayHQ` because one regional festival can span several Zones or HQs at once
  — a Holiday is not limited to exactly one Zone or one HQ.
- **The weekly off day is not a `Holiday` row.** It's a recurring rule
  (`WEEKLY_OFF_DAY = SUNDAY`, or whichever day) in the Tier-0 Config module's `SystemConfig`
  store — application logic (wherever "is this a working day" is asked, e.g. Planning's
  submission-cutoff checks) treats it as a non-working day alongside whatever `Holiday` rows
  apply, without HR enumerating 52 rows a year. (The ERD doc's own text references this as living
  in "Module 5" by discussion order; per
  [`../hld/03-system-architecture.md`](../hld/03-system-architecture.md) §3, `SystemConfig` is
  actually its own Tier-0 `Config` module in the real dependency graph — HR reads it the same way
  every module does, through `Config`'s contract, not through Planning.)

## Approval workflow — deliberately NOT the shared engine

> **Superseded 2026-09-24** (`../decision-log.md`, "Phase 3: the approval engine becomes a
> module"): Leave now goes Employee → Manager → HR or Admin through the approval module, per the
> client's §11.2. This section is rewritten when HR is built (Phase 4); kept below as the record
> of the earlier design.

Every other approvable entity in this system (`Planning`'s Tour Plans, `Field Activity`'s Doctor
Service) routes through the shared Approval Workflow Engine
([`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md)): submitter →
Nearest Higher Manager → auto-forward to Admin. **Leave does not.** PRD §5.3 assigns leave
approve/reject to HR directly, "per HR's ownership of leave management" — `Leave.reviewed_by` is
an HR user, never a `manager_id` walked up the reporting chain. This module therefore has **no
dependency on the Phase-3 Approval Engine** and does not call it. This is a deliberate exception,
not an oversight — a future reader should not assume every "submit → get approved" flow in this
system shares the same mechanism.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/hr/leave-types` | HR, Admin | List leave types |
| `POST` | `/hr/leave-types` | HR, Admin | Create a leave type |
| `GET` | `/hr/leave-policies` | HR, Admin | List the grade-wise Leave Master |
| `PUT` | `/hr/leave-policies/:payBandId/:leaveTypeId` | HR, Admin | Set the default days for a (Pay Band, Leave Type) pair |
| `GET` | `/hr/leave-balances/me` | FIELD (any) | View own leave balance |
| `GET` | `/hr/leave-balances/:userId` | HR, Admin | View any employee's balance |
| `PATCH` | `/hr/leave-balances/:userId/:leaveTypeId` | HR, Admin | Manually adjust an individual's allocation |
| `POST` | `/hr/leaves` | FIELD (any) | Submit a leave request |
| `GET` | `/hr/leaves/me` | FIELD (any) | List own leave requests |
| `GET` | `/hr/leaves` | HR, Admin | List pending/all leave requests |
| `POST` | `/hr/leaves/:id/approve` | HR, Admin | Approve |
| `POST` | `/hr/leaves/:id/reject` | HR, Admin | Reject |
| `GET` | `/hr/holidays` | any authenticated | List holidays, scoped to the caller's Zone/HQ + National |
| `POST` | `/hr/holidays` | HR, Admin | Create a holiday (with Zone/HQ tags if not National) |
| `DELETE` | `/hr/holidays/:id` | HR, Admin | Remove a holiday |

## Edge cases

- **A `LeavePolicy` change after balances are already seeded.** Existing `LeaveBalance` rows are
  untouched — the new default only applies to balances seeded from that point forward (a new
  hire, or a new year's seed). HR must manually adjust existing balances if a retroactive change
  is intended; there is no bulk-propagate action by design (see Write-path rules above).
- **A manually-overridden balance surviving a policy change.** Because the seed is one-time, an
  employee whose `allocated_days` HR bumped by hand keeps that value indefinitely — a later
  across-the-board `LeavePolicy` edit does not overwrite it. This is intended, not a bug to fix.
- **Insufficient balance at request time.** `days_count` exceeding remaining
  `allocated_days − used_days` — reject at submission with a clear message rather than allowing
  an over-drawn balance; whether negative balances are ever legitimate (e.g. an advance against
  next year's allocation) is not decided — see Deferred.
- **A Holiday spanning multiple Zones with an employee whose HQ sits in more than one tagged
  Zone** — not possible under the ERD's strict Zone→HQ hierarchy (an HQ belongs to exactly one
  Zone), so no conflict resolution is needed here; the employee's single HQ/Zone path determines
  which tagged holidays apply.
- **An employee with no `PayBand` yet** (a brand-new hire before HR assigns one, or any
  non-FIELD role, which never gets one) — has no seeded `LeaveBalance` rows at all. Requesting
  leave before a Pay Band is assigned should be blocked with a clear reason, not silently
  succeed against a zero balance.

## Dependencies

Identity (Tier 1 — `PayBand` for policy defaults, `User` for whose balance/request it is) and
Territory (Tier 2 — `Zone`/`HQ` for Holiday scoping). No dependency on the Approval Workflow
Engine (see above). Consumed by Payroll (Tier 5) for the unpaid-leave deduction figure.

## Deliberately deferred

- Carry-forward / expiry rules for unused leave days across years.
- Negative-balance ("leave in advance") handling.
- Bulk re-seeding of existing balances when a `LeavePolicy` default changes.
- Any notification/reminder mechanism around pending leave requests.
