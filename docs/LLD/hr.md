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
- **`Leave`** — a request: type, `startDate`/`endDate`, `half` (only on leaves from before 2026-10-05; a new request with one is refused), reason,
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
  holidays that apply to the employee — National, their HQ's and their HQ's Zone's. Half-day leave was removed
  (2026-10-05): every day counts 1, though a leave made earlier as a half keeps counting 0.5. Stored on the Leave at submit, so a later holiday edit doesn't
  rewrite past leave; Payroll's per-month count and the DCR "on leave" check read these days.
- **Rules:** at least one counted day; start no more than `LEAVE_BACKDATE_DAYS` (default 0: not in the past) days back and
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
  /** The days in a range that are not working days for this employee: their weekly off day (`WEEKLY_OFF_DAY`) and the holidays that apply — the missed-DCR job skips them. */
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
  /** The holidays that apply to this employee in a date range — for "is this a working day". */
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
  /** Days locked on the Monthly Plan: the weekly off, and holidays of the employee's MAIN HQ (not every HQ covered). 2026-10-22. */
  listPlanOffDays(userId: string, from: string, to: string): Promise<{ date: string; reason: 'WEEKLY_OFF' | 'HOLIDAY'; name: string | null }[]>;
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
| `GET` | `/holidays?from=&to=&scope=&zoneId=&hqId=` | any | FIELD: the ones that apply to them; HR/Admin: all, filterable. `from`/`to` required, at most 400 days; not scoped by the financial-year header |
| `POST` / `DELETE` | `/holidays`, `/holidays/:id?group=` | HR, Admin | Maintain the calendar. `POST` takes `date` and an optional `endDate` (a range, at most 31 days) and returns the days created; `DELETE` with `group=true` removes every day of a range |
| `POST` | `/holidays/import?dryRun=` | Admin | Bulk-add from a CSV (below) |

## Holiday upload (2026-10-12)

The Admin loads a year's list from one CSV (`multipart/form-data`, field `file`, ≤ 1 MB, ≤ 500 rows). Columns: `name`, `date` (`YYYY-MM-DD`), `scope` (`NATIONAL`/`ZONE`/`HQ`), `zones` (Zone names, `;`-separated), `hqs` (`Zone/HQ` pairs, `;`-separated; an HQ name is only unique inside its Zone). Same scope rules as adding one holiday.

- **All or nothing.** Any problem (bad date, scope, unknown or inactive Zone/HQ, the same holiday twice in the file) is a `400` whose `data.errors` lists every problem with its file line; nothing is written.
- **Re-upload is safe.** A holiday already on the calendar (same name, date, scope and places, ignoring case) is skipped, not duplicated.
- **`?dryRun=true`** returns the preview (every row `NEW` or `EXISTS`, plus `created` / `skipped` counts) without writing. The web dialog always previews first.
- Past and future dates are accepted. Excel users save as CSV. The CSV reader is `shared/csv/csv.ts`, shared with Territory's hierarchy import; Zone/HQ names are matched through Territory's `findZoneByName` / `findHqByName`.
- Not scoped by the financial-year header, like the rest of `/hr/holidays`.

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
- **A Holiday running several days** (Durga Puja, 2–8 Oct; added 2026-10-22) — one row per day, sharing a `groupId`
  (`null` on a single day and on rows from before ranges), so everything reading holidays by `date` (leave counting,
  attendance, payroll, the phone's snapshot) is unchanged. A range includes the weekly off day if it falls inside;
  leave counting skips either. The web shows a range as one line; deleting it removes every day, while the API can
  still remove a single day. The CSV upload stays one row per date.

## Dependencies

Identity (users, the manager chain, `getEmploymentDetails` for Pay Band and joining date),
Territory (`getUserHq`, `getHq`, `getZone`), Approval (the `LEAVE` workflow), Config.

## Deliberately deferred

- Carry-forward / expiry of unused leave across leave years.
- Negative balances ("leave in advance").
- Bulk re-seeding when a `LeavePolicy` default changes.
- Notifications around pending leave.


## Approval cutoff and the probation switch (2026-10-12)

- **Probation is per employee:** `EmployeeProfile.onProbation` (default false, set in the onboarding wizard, editable by HR/Admin). Only when it is true do `probationMonths` / `PROBATION_MONTHS` apply; the software being new does not make existing employees probationers. Everything below under "Probation (2026-10-05)" is unchanged once the switch is on. No migration: a missing field reads as false.
- **Approval cutoff = the leave's first day:** `LeaveApprovalCutoff.assertMayApprove` runs in the `LEAVE` `onStatusChange` for `MANAGER_APPROVED` and `APPROVED`; if `startDate` is before today it throws `409 LEAVE_APPROVAL_LATE` and the approval rolls back (rejecting and withdrawing are unaffected). `LEAVE_BACKDATE_DAYS` now defaults to 0.
- **Exception:** `LeaveApprovalGrant` (collection `leaveapprovalgrants`, one OPEN per leave, usable once, ends at `expiresAt`; `LATE_LEAVE_GRANT_VALID_HOURS` 24, `LATE_LEAVE_GRANT_MAX_HOURS` 168). Admin only: `POST` / `DELETE /api/hr/leaves/:id/approval-grant`. Consumed inside the approval transaction, like `ExpenseMonthGrant` and the late Plan grant (B8).
- **Auto-reject:** `ExpireLateLeaves` (server job every 30 min, `hr.expireLateLeaves`) rejects leaves still `SUBMITTED` / `MANAGER_APPROVED` whose start date has passed, through the approval module's `autoReject` (history entry with authority `AUTO`, comment "Automatic: …"), so the ledger frees the balance. A leave with a usable Admin exception is skipped.
- **Web:** Admin sees "Allow late approval" on an open, started leave in HR → Leaves.
- **Not done:** employee cancel of an approved leave.

## Probation (2026-10-05)

Probation runs from the joining date for the employee's own `probationMonths` (Identity, empty = the `PROBATION_MONTHS` setting, 0 = none),
and only while `PROBATION_LEAVE_PAID` is on. Two effects, both in `application/probation.ts`'s window (`probationEndsOn`, the first day after it):

- **Requests:** a paid leave that *starts* inside probation is never refused for balance. It reserves what balance there is
  (`Leave.ledgerDays`, 0 if none) and the rest is paid without a ledger row; approve / reject / withdraw / reopen move only `ledgerDays`.
  Leaves from before this read `ledgerDays` as `daysCount`.
- **Payroll:** `getUnpaidLeaveDays` leaves out any unpaid-leave day inside probation, so no deduction is made for it.

## Locked after salary (2026-10-06)

`LeaveLock` (`application/leaveLock.ts`): when `LEAVE_LOCKED_AFTER_PAYROLL` is on and the employee's salary run for a month is finalized, a leave
touching that month can't be requested or edited, and the `LEAVE` ledger hook refuses `APPROVED` and `REOPENED` for it (409 `PAYROLL_FINALIZED`),
whether the leave is paid or unpaid. Rejecting or withdrawing one that was never approved is allowed. Payroll sits above HR, so the check is a
port bound at the composition root (`hr.bindPayrollLock`); unbound (tests, scripts) nothing is locked.

## Proof on a leave (2026-10-06)

A leave type has `allowsProof` (the starting **Sick** type has it on; HR switches it per type on the Leave types tab). On a leave of such a type the employee can attach proof —
a prescription, a medical certificate — which is **optional and never blocks a request**: `POST /api/hr/leaves/:id/attachments` (multipart `file`; the employee only) adds
one, `DELETE /api/hr/leaves/:id/attachments/:attachmentId` removes one. A PDF, JPG or PNG (read from the file's own bytes, not its name or declared type), at most
**5 MB**, at most **3 files** per leave (a conditional update, so two racing uploads can't make a fourth; the loser's file is removed from storage). It can be added after the leave is
approved and survives an edit and resubmit. The files come back with the leave (`GET /api/hr/leaves/:id`, the lists, the approvals preview) as `attachments` (url, name, type, size;
never the storage id) and `allowsProof`, so the employee, their managers, HR and Admin see them where they already see the leave. Files live in Cloudinary under
`greynote/users/<employee>/leave-proof/<leave>`. The phone's upload screen is part of the mobile app; the web shows the files.
