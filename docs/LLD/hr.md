# HR

Leave and holiday administration for field-force employees — HR's slice of PRD §5.3 (leave
balances, leave requests, the Holiday Calendar) and §6.2.D (the mobile app's Holiday List and
leave screens). ERD: [`../erd/07-hr-ops.md`](../erd/07-hr-ops.md). Roadmap:
[`../roadmap.md`](../roadmap.md) phase 4, Tier 3. The leave rules are the working assumptions
accepted on 2026-09-28 (client sign-off F3, F11–F16; `../decision-log.md`).

## What it owns

- **`LeaveType`** — HR-managed. `isPaid` decides whether it has a balance (paid) or feeds
  Payroll's deduction (unpaid). Seeded starting list (sign-off F17): Casual, Sick, Earned (paid),
  Loss of Pay (unpaid). `isPaid` is fixed once any leave uses the type.
- **`LeavePolicy`** — the grade-wise Leave Master: default days per leave year for a
  (`PayBand`, paid `LeaveType`) pair.
- **`LeaveBalance`** — per user, paid leave type and leave year: `allocatedDays`, `usedDays`,
  `pendingDays`. Seeded from `LeavePolicy`, then HR-editable per person.
- **`Leave`** — a request: type, `startDate`/`endDate`, optional half (`FIRST`/`SECOND`), reason,
  and the **counted days** (`days: [{ date, portion }]`, `daysCount` their sum). Its approval
  state is the `LEAVE` `ApprovalRequest` in the `approval` module (`approval.md`), not fields on
  the row.
- **`Holiday`** — `name`, `date`, `scope` (`NATIONAL`/`ZONE`/`HQ`), `zoneIds[]`, `hqIds[]`.

Not owned here: an employee's HQ is Territory's `UserHqAssignment` (`territory.md`), read through
Territory's contract; the leave-year start (`FY_START_MONTH`), the weekly off day
(`WEEKLY_OFF_DAY`) and the backdating limit (`LEAVE_BACKDATE_DAYS`) are Config keys.

## Leave year

The financial year, from `FY_START_MONTH` (April): leave year 2026 is 2026-04-01 … 2027-03-31
(sign-off F11, HLD 09). Balances are per leave year; a request can't cross a leave-year boundary
(the employee splits it).

## Balances

- **Seeded lazily.** Identity (Tier 1) can't call HR when a Pay Band is set, so HR creates a
  user's balances for a leave year the first time they're needed — a balance read or a leave
  request. The allocation is the Pay Band's `LeavePolicy` days; if the employee joined during
  that leave year, the share for the months from their joining month on (sign-off F13), rounded
  to half days. The next leave year seeds itself the same way — no year-end job.
- **A seed is a one-time copy.** A later `LeavePolicy` edit doesn't touch seeded rows; HR adjusts
  an individual's `allocatedDays` directly (never below `usedDays + pendingDays`).
- **No Pay Band** — no balances; a paid leave request is refused with that reason.
- **Only paid types have balances.** An unpaid type (Loss of Pay) is always allowed (F16).
- **The ledger**, changed in the same transaction as the approval event that causes it:

| Event | `pendingDays` | `usedDays` |
|---|---|---|
| submit / resubmit | + days | |
| `MANAGER_APPROVED` | | |
| final `APPROVED` | − days | + days |
| `REJECTED` / `WITHDRAWN` | − days | |
| Admin `REOPENED` (of an approved leave) | | − days |

  Available = `allocatedDays − usedDays − pendingDays`, so two requests pending at once can't
  overdraw. The submit raises `pendingDays` with a conditional update ("available ≥ days"), so the
  check and the reservation are one atomic step.

## Leave requests

- **Counted days** (F12, F14): every date from start to end, minus `WEEKLY_OFF_DAY` and the
  holidays that apply to the employee — National, their HQ's and their HQ's Zone's. A half day
  needs start = end and counts 0.5. Stored on the Leave at submit, so a later holiday edit doesn't
  rewrite past leave; Payroll's per-month count and the DCR "on leave" check read these days.
- **Rules:** at least one counted day; start no more than `LEAVE_BACKDATE_DAYS` (30) days back and
  within the current leave year (F15), or in the next one; no overlap with the employee's own
  leave that's waiting or approved; paid types need the balance.
- **A blocked user can still request leave** (PRD §7.5) — unlike Plans — to cover the gap that
  caused the block.
- **No drafts.** Creating a Leave submits it. It's editable only when `REJECTED`, `WITHDRAWN` or
  `REOPENED` (`isEditableBySubmitter`), and the edit resubmits it — recomputing its days.

## Approval workflow

Kind `LEAVE`, final approvers `HR` and `ADMIN`: Employee → Nearest Manager → HR or Admin (client
§11.2, decision-log 2026-09-24). Approve, reject, withdraw and Admin reopen are the approval
module's `/api/approvals/*` endpoints with `kind=LEAVE`; HR's inbox already lists exactly the
kinds it's a final approver for. HR's `onStatusChange` applies the balance ledger above inside the
approval module's transaction — if it throws, the decision rolls back too.

## Public contract

```ts
interface HrPublicContract {
  /** Phase 6's missed-DCR job: a Manager-Approved (or fully approved) leave covers this day (PRD §7.5). */
  isOnLeave(userId: string, date: string): Promise<boolean>;
  /** Phase 7's Payroll: approved unpaid-leave days falling in this month (`YYYY-MM`). */
  getUnpaidLeaveDays(userId: string, month: string): Promise<number>;
  /** The holidays that apply to this employee in a date range — for "is this a working day". */
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
}
```

## HTTP surface

All under `/api/hr`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `GET` | `/leave-types` | any | List leave types |
| `POST` / `PATCH` | `/leave-types`, `/leave-types/:id` | HR, Admin | Create / rename (and `isPaid` while unused) |
| `GET` | `/leave-policies` | HR, Admin | The Leave Master |
| `PUT` | `/leave-policies/:payBandId/:leaveTypeId` | HR, Admin | Set a grade's default days |
| `GET` | `/leave-balances/me?year=` | FIELD | Own balances |
| `GET` | `/leave-balances/:userId?year=` | HR, Admin; a manager for their team | Someone's balances |
| `PATCH` | `/leave-balances/:userId/:leaveTypeId` | HR, Admin | Adjust an individual's allocation |
| `POST` | `/leaves` | FIELD | Request leave (submits it) |
| `PUT` | `/leaves/:id` | FIELD | Edit and resubmit after a rejection, withdrawal or reopen |
| `GET` | `/leaves/me` | FIELD | Own leaves |
| `GET` | `/leaves` | HR, Admin | All leaves, filtered |
| `GET` | `/leaves/:id` | owner, their managers, HR, Admin | One leave |
| `GET` | `/holidays?year=` | any | FIELD: the ones that apply to them; HR/Admin: all, filterable |
| `POST` / `DELETE` | `/holidays`, `/holidays/:id` | HR, Admin | Maintain the calendar |

## Edge cases

- **A `LeavePolicy` change after balances are seeded** — seeded rows are untouched; the new
  default applies to balances seeded from then on. HR adjusts individuals if a retroactive change
  is intended.
- **A Pay Band change mid-year** (a promotion) — the year's balances stay as seeded; HR adjusts.
- **An employee with no HQ set** — only National holidays apply to them.
- **A holiday added or removed after a leave was requested** — the stored days stand.
- **Reopening an approved leave** gives the days back (`usedDays − days`); the edited resubmit
  reserves them again.
- **A Holiday spanning several Zones or HQs** — one row with several ids.

## Dependencies

Identity (users, the manager chain, `getEmploymentDetails` for Pay Band and joining date),
Territory (`getUserHq`, `getHq`, `getZone`), Approval (the `LEAVE` workflow), Config.

## Deliberately deferred

- Carry-forward / expiry of unused leave across leave years.
- Negative balances ("leave in advance").
- Bulk re-seeding when a `LeavePolicy` default changes.
- Notifications around pending leave.
