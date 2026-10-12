# Mobile — Expenses (monthly statement)

What the field app must do for the Expenses screen, and the rules the server enforces. The server is the authority: the phone's cached status is a UX gate only. **Online only** — nothing here is queued offline. The phone app is another team's; this is the contract it builds against. Decisions: decision-log 2026-10-10 (monthly statement) and 2026-10-12 (deadlines).

**Status key:** ✅ built on the server. 📱 the phone screen still has to show it (the web portal has no employee screen).

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **TA and DA are automatic.** The server computes them from the approved DCR; the phone never sends or edits them. | ✅ |
| 2 | The employee's own claims are **"Other" entries** (miscellaneous): a date, an amount in paise and a note, optional proof files (PDF/JPG/PNG, 5 MB, up to 3). A date may be any past day (never in the future) of a month still open for editing. | ✅ |
| 3 | The **month is the unit**: `GET /api/field-activity/expense-months?month=YYYY-MM` returns each date's TA, DA and Other, the totals and the status `DRAFT` → `SUBMITTED` → `APPROVED` (or `REJECTED`). `…/history` lists previous months. | ✅ |
| 4 | **Submit** (`POST …/expense-months/:month/submit`) only after the month has ended (`409 MONTH_NOT_ENDED`), never empty. Entries lock once sent (`409 EXPENSE_MONTH_LOCKED`) and open again after a rejection. | ✅ |
| 5 | **Send deadline:** the end of the business day of `EXPENSE_SUBMIT_CUTOFF_DAY` (default the 7th) of the **next month**, in `BUSINESS_TIMEZONE` with the global day start. Never compute it on the phone — read `deadlines.submitBy` (ISO). | ✅ |
| 6 | Past the deadline, submit is refused with **`409 EXPENSE_SUBMIT_LATE`** unless an exception is open. The statement says so: `submitLate: true` and `canSubmit: false`. | ✅ |
| 7 | **Late exception:** Admin (or a manager, for their team, only while `LATE_EXPENSE_GRANT_BY_MANAGER` is on) can allow one month to be sent late, once, until `exceptions.submitUntil`. Used up by the submit; after a rejection a new one is needed. It can never be given once any row of the month is paid. | ✅ |
| 8 | **Approval deadline** (`deadlines.approveBy`, default the 10th): after it the manager's approval is refused with `409 EXPENSE_APPROVAL_LATE` unless Admin allows it (`exceptions.approveUntil`). The employee can't act on this; show it as "waiting for approval". | ✅ |
| 9 | Approval makes the month payable; the Accountant pays on `EXPENSE_PAYOUT_DAY`. `paidPaise` shows how much has been settled. | ✅ |
| 10 | A month already **paid in part** cannot be reopened or allowed late. | ✅ |

## 2. What the screen should do 📱

- Show the month with its **send-by date**. Before it: normal submit button. After it, with `submitLate: true`: disable submit and say "The deadline has passed — ask your manager or Admin to allow it."
- With `exceptions.submitUntil` set: submit works again; show "Allowed until <time>".
- On `EXPENSE_SUBMIT_LATE` (a race with the deadline), refresh the statement and show the same message.
- Show `SUBMITTED` as "waiting for approval" and, if `approveBy` has passed with no `approveUntil`, add "approval is late — your manager has to ask Admin".
- Times are ISO instants: format them in the business timezone from the app's config, not the phone's.

## 3. Settings

`EXPENSE_SUBMIT_CUTOFF_DAY` (7), `EXPENSE_APPROVAL_CUTOFF_DAY` (10), `LATE_EXPENSE_GRANT_BY_MANAGER` (off), `LATE_EXPENSE_GRANT_VALID_HOURS` (24), `LATE_EXPENSE_GRANT_MAX_HOURS` (168). Admin changes them in System settings; the next call sees the change.
