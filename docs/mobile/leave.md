# Mobile — Leave

What the field app must do for leave, and the rules the server enforces. The server is the authority: the phone's cached balances and holidays are a UX aid only and may be stale. Design background: [`LLD/hr.md`](../LLD/hr.md), [`decision-log.md`](../decision-log.md) (2026-10-05, 2026-10-06, 2026-10-12). Related: [`dailyplan.md`](dailyplan.md) rule 7 (leave and the missed-report block).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against. **Changed 2026-10-12:** a leave can no longer start in the past (`LEAVE_BACKDATE_DAYS` is now `0`), and a leave that has started can no longer be approved (rule 7).

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Balances come from HR, not from the employee.** Each employee has a yearly balance per paid type (Casual, Sick, Earned …), seeded from the Leave Master for their Pay Band and prorated for a mid-year joiner. HR can adjust one person's allocation. The phone shows `allocated`, `used`, `pending` and available (= allocated − used − pending). | ✅ |
| 2 | **Request** with `POST /hr/leaves` `{ leaveTypeId, startDate, endDate, reason }`. Whole days only (no half days). Weekly offs and holidays inside the range are skipped and not counted. A leave cannot cross into the next leave year (split it) and cannot overlap one of the employee's own open leaves. | ✅ |
| 3 | **Paid types** reserve days from the balance; a request for more than is available is refused (`409`). **Loss of Pay** (unpaid) has no balance and is always allowed — it is deducted from salary when approved (monthly base ÷ 30). | ✅ |
| 4 | **Probation:** an employee marked **On probation** at onboarding has all leave paid while the probation lasts (joining date + the employee's months, else `PROBATION_MONTHS`, only while `PROBATION_LEAVE_PAID` is on). A paid leave is never refused for balance then, and Loss of Pay inside probation is not deducted. Employees are **not** on probation unless HR marked them; the phone just shows what the server returns. | ✅ |
| 5 | **Approval:** employee → their manager → HR or Admin (Admin may approve at any stage). Nobody approves their own leave. Balance is reserved (`pending`) on request and moves to `used` on final approval; reject or withdraw gives it back. | ✅ |
| 6 | **Start date:** today or later (`LEAVE_BACKDATE_DAYS` = 0), inside this leave year or the next. | ✅ |
| 7 | **Approval cutoff = the leave's first day.** Once that day has begun, a manager or HR can no longer approve it: `409 LEAVE_APPROVAL_LATE`. They can still **reject** it. Only an Admin **exception** (one use, ends at `expiresAt`, default `LATE_LEAVE_GRANT_VALID_HOURS`) lets one through. A leave left unapproved past its first day counts as ordinary working days: the missed-report and absent rules apply "as usual". | ✅ |
| 8 | **An approved (or manager-approved) leave day never blocks the employee.** No daily report is expected that day, the missed-report block skips it, and work after the leave carries on as normal. A leave that is only `SUBMITTED` (not yet approved) does **not** exempt the day. | ✅ |
| 9 | **Editing:** only a `REJECTED`, `WITHDRAWN` or `REOPENED` leave can be changed (`PUT /hr/leaves/:id`); saving resubmits it. The employee can **withdraw** before final approval (`POST /approvals/:id/withdraw`). Cancelling an already-approved leave is not in the app: ask Admin to reopen it. | ✅ |
| 10 | **Proof (optional):** on a type that allows it (Sick), up to 3 files of 5 MB (`POST /hr/leaves/:id/attachments`, `DELETE …/:attachmentId`). | ✅ |
| 11 | **Locked after salary:** a leave in a month whose salary is finalized can't be requested, edited, approved or reopened (`409 PAYROLL_FINALIZED`). | ✅ |

## 2. Statuses

`SUBMITTED` → `MANAGER_APPROVED` → `APPROVED`. Also `REJECTED`, `WITHDRAWN`, and `REOPENED` (Admin undid an approval). The last three are editable and can be resubmitted. Treat `MANAGER_APPROVED` as "approved, waiting for HR" for the missed-report exemption (rule 8) but as **not yet deducted** for balance and salary.

## 3. What the phone should show

From `GET /hr/leaves/me`, `GET /hr/leave-balances/me` and the sync snapshot (leave types, own balances, holidays, `weeklyOffDay`):

| Field | Use |
|---|---|
| `status` | badge; whether Edit / Withdraw is offered |
| `daysCount`, `days[]` | the counted days (off days and holidays already left out) |
| `leaveTypeName`, `isPaid` | "Paid" / "Loss of Pay" label |
| `allowsProof`, `attachments` | the attach button and the files |
| balances | per type: allocated, used, pending, available |

- Date picker: earliest date is **today**. If the range has no working day, say so (the server answers `400`).
- Not enough balance on a paid type: **"Not enough Casual leave left. Request Loss of Pay for the rest."**
- `LEAVE_APPROVAL_LATE` is seen by the approver, not the employee. The employee whose leave starts without an approval sees it still `SUBMITTED`: show **"This leave has started and isn't approved. Ask your manager or Admin."** and offer Withdraw.
- `PAYROLL_FINALIZED`: **"This month's salary is already finalized."**

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/hr/leave-balances/me?year=` | Own balances for the leave year. |
| `POST` | `/hr/leaves` | Request leave. |
| `PUT` | `/hr/leaves/:id` | Change and resubmit a rejected / withdrawn / reopened leave. |
| `GET` | `/hr/leaves/me` | Own leaves, newest first. |
| `GET` | `/hr/leaves/:id` | One leave (owner, their managers, HR, Admin). |
| `POST` / `DELETE` | `/hr/leaves/:id/attachments[/:attachmentId]` | Proof files. |
| `POST` | `/approvals/:id/withdraw` | Withdraw before final approval. |
| `POST` / `DELETE` | `/hr/leaves/:id/approval-grant` | **Admin only** (web): allow / withdraw a late approval `{ reason, expiresAt? }`. |

Errors the screens must handle: insufficient balance (409), overlap (409), `LEAVE_APPROVAL_LATE` (409), `PAYROLL_FINALIZED` (409, `month`), no Pay Band set (400), validation errors with `field`.
