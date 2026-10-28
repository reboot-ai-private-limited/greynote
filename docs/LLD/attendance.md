# Attendance

What each day of a field employee's month was — present, absent, leave, strike, holiday, weekly off — worked out from the other modules, for the
calendars and for Payroll's absent-day deduction. Decision-log 2026-10-06; sign-off K20 (absent cuts salary), K25 (day order), K26 (strike).

## What it owns

Nothing is stored. A **read model** at its own tier (5, below Payroll and Marketing): `domain/dayStatus.ts` is the one pure rule (`classifyDay`),
`application/attendanceCalendar.ts` gathers a month's facts and applies it.

## The rule (`classifyDay`) — first match wins

1. before the employee's joining day → `BEFORE_JOINING`
1a. after their last working day (deactivated, 2026-10-22), until a rejoining day if they were reactivated → `NOT_EMPLOYED` (never absent, never deducted)
2. after today → `NOT_YET`
3. a holiday that applies to them (National, their HQ's, its Zone's) → `HOLIDAY`
4. their weekly off (the `WEEKLY_OFF_SCHEDULE` rules in force that day, e.g. every Sunday and the 1st and 3rd Saturday) → `WEEKLY_OFF` (a holiday that is also an off date is a holiday)
5. covered by a Manager-Approved or fully approved leave, paid or unpaid → `LEAVE`
6. the day's plan says Strike **and** the plan is past the manager → `STRIKE` (a draft or rejected Strike plan excuses nothing)
7. a submitted, manager-approved or approved daily report → `PRESENT`
8. otherwise `ABSENT` — but today with no report yet is `NOT_YET` (a day only becomes absent once it is over), and **with no joining date recorded the day is `UNKNOWN`**, never absent: a missing date must not cost anyone a month's pay (found in the browser pass: test employees without one were all "absent" from the 1st)

A rejected, withdrawn or reopened report is not a report, so that day is absent until it is resubmitted. A Meeting or Conference day without a
report is absent too.

## What costs salary

Two Payroll-group settings (Admin-editable, `PAYROLL` module in the settings screen):

- `ABSENT_DEDUCTS_SALARY` (default **on**): absent days are deducted like unpaid-leave days, base ÷ 30 each. Off: nothing is deducted.
- `STRIKE_DEDUCTS_SALARY` (default **off**): strike days are deducted like absent days. Only matters while the first is on.

`deductibleDays` = absent days (when the first is on) + strike days (when both are on). Holidays, weekly offs, leave and present days never cost salary;
unpaid leave is deducted by Payroll's own leave line, never twice, because a leave day is never absent. Probation gives no protection to an absent day
(only paid leave in probation is protected).

## Reads (what it asks of the modules below)

| From | Method | Why |
|---|---|---|
| Identity | `getEmploymentDetails`, `listActiveFieldUserIds`, `getUserSummaries` | the joining day, who to list |
| HR | `listOffDates`, `listHolidayDates`, `listLeaveDates` | off days, holidays, approved leave — one call each for the month |
| Planning | `listDailyPlanDays` | each plan's status and working type |
| Field Activity | `listReportedDates` | the days with a qualifying report (the same rule as `hasQualifyingDcr`) |
| Config | the two settings, `BUSINESS_TIMEZONE` | |

A handful of queries per employee for the whole month, not one per day.

## Public contract

`getMonth(userId, month)` → the days, counts, `absentDays`, `strikeDays`, `deductibleDays`; `countDeductibleDays(userId, month)` — what Payroll takes.

## HTTP surface

| Method | Path | Who | What |
|---|---|---|---|
| `GET` | `/api/attendance/month?userId=&month=` | Admin, HR, Accountant | one employee's month |
| `GET` | `/api/attendance/payroll-calendar?month=` | Admin, HR, Accountant | every active field employee's month in one line, with what payroll would deduct |

Both are scoped to the financial year in view (a month outside it is refused).

## Edge cases and cautions

- **A report submitted late changes the month** until payroll for it is finalized; after that the salary is locked. HR should read the Attendance screen before
  finalizing, and turn a real absence into leave first (leave is locked after finalization too — `LEAVE_LOCKED_AFTER_PAYROLL`).
- **A leave that is only Manager-Approved** counts as leave here (the same rule as `isOnLeave`), but Payroll deducts unpaid leave only once fully Approved, so
  an unpaid leave stuck at the manager is neither deducted nor absent until it is finalized.
- **No joining date recorded:** would-be-absent days are `UNKNOWN`, never deducted; the calendars warn and ask for the date on the Profile tab. Active status does not require a joining date, so HR must set it.
- **Not built:** per-day drill-down (which report or leave a day came from), export, and a separate probation setting.
