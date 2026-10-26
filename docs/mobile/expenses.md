# Mobile — Expenses (monthly statement)

What the field app must do for the Expenses screen, and the rules the server enforces. The server is the authority: the phone's cached status is a UX gate only. **Online only** — nothing here is queued offline. The phone app is another team's; this is the contract it builds against. Decisions: decision-log 2026-10-10 (monthly statement) and 2026-10-12 (deadlines).

**Status key:** ✅ built on the server. 📱 the phone screen still has to show it (the web portal has no employee screen). ✅📱 built in the field app (typechecked and linted; not yet run on a phone).

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
| 11 | **File name of the Expenses CSV (2026-10-26).** `<name>-<designation>-expenses-<YYYY-MM>-<code>.csv`, e.g. `rahul-roy-mr-expenses-2026-11-emp03.csv`; the person is the employee the statement belongs to, also when a manager downloads it for a team member. Exact rule: [`monthlyplan.md`](monthlyplan.md) rule 22. | ✅ web; 📱 phone to change |

## 2. What the screen should do ✅📱

- Show the month with its **send-by date**. Before it: normal submit button. After it, with `submitLate: true`: disable submit and say "The deadline has passed — ask your manager or Admin to allow it."
- With `exceptions.submitUntil` set: submit works again; show "Allowed until <time>".
- On `EXPENSE_SUBMIT_LATE` (a race with the deadline), refresh the statement and show the same message.
- Show `SUBMITTED` as "waiting for approval" and, if `approveBy` has passed with no `approveUntil`, add "approval is late — your manager has to ask Admin".
- Times are ISO instants: format them in the business timezone from the app's config, not the phone's.

**Built in the field app (2026-10-13 check):** the month statement and history, Other entries with up to 3 receipts, the send-by date (shown during the month too), the disabled Submit with the late message, "Allowed until …", the late-approval note on a `SUBMITTED` month, a refresh on `EXPENSE_SUBMIT_LATE`, the rejection reason, `paidPaise` ("Paid so far"), and offline reading of the last statement. Manager side: Team → Late submissions → Expenses, and the approval card with Approve by / `approveUntil` and the `EXPENSE_APPROVAL_LATE` message.

### Manager: allow a month late ✅📱

Team → *Late submissions* → **Expenses**. A manager (while `LATE_EXPENSE_GRANT_BY_MANAGER` is on; Admin always) picks a team member, the month, and `SUBMIT` (let them send it) or `APPROVE` (let it be approved), a reason and how long it lasts.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/field-activity/expense-grants` | `{ userId, month, phase: SUBMIT\|APPROVE, reason, expiresAt? }`. `409` once any row of the month is paid. |
| `GET` | `/field-activity/expense-grants` | Admin: all; others: their own and their team's. |
| `POST` | `/field-activity/expense-grants/:id/revoke` | Revoke one not yet used. |

On the approval card the manager sees **Approve by** and any `approveUntil`. After `approveBy` with no exception, approving fails with `EXPENSE_APPROVAL_LATE`: the app says to ask Admin or reject.

## 3. Settings

`EXPENSE_SUBMIT_CUTOFF_DAY` (7), `EXPENSE_APPROVAL_CUTOFF_DAY` (10), `LATE_EXPENSE_GRANT_BY_MANAGER` (off), `LATE_EXPENSE_GRANT_VALID_HOURS` (24), `LATE_EXPENSE_GRANT_MAX_HOURS` (168). Admin changes them in System settings; the next call sees the change.
