# Late grants — LLD

One-off exceptions that let one employee do one late thing for one period. The module is `apps/api/src/modules/lateGrants/`; decision-log 2026-11-02.

## Model

`LateGrant { userId, kind, periodKey, reason, grantedBy, grantedByRole, grantedAt, expiresAt, status, usedAt, usedRef, revokedAt, revokedBy }`. Status `OPEN | USED | REVOKED | EXPIRED`; an `OPEN` row past `expiresAt` reads as `EXPIRED` (it is only written lazily). At most one `OPEN` grant per employee, kind and period (unique partial index).

| Kind | Period | Spent by use | Deadline it lifts | Who may grant (besides Admin) |
|---|---|---|---|---|
| `DAILY_PLAN` | `YYYY-MM-DD` | yes | submit cutoff on the plan's day | manager, if `LATE_PLAN_GRANT_BY_MANAGER` |
| `MONTHLY_PLAN` | `YYYY-MM` | yes | `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` | same |
| `EXPENSE_SUBMIT` | `YYYY-MM` | yes | `EXPENSE_SUBMIT_CUTOFF_DAY` | manager, if `LATE_EXPENSE_GRANT_BY_MANAGER` |
| `EXPENSE_APPROVE` | `YYYY-MM` | yes | `EXPENSE_APPROVAL_CUTOFF_DAY` | same |
| `MONTHLY_STOCK` | `YYYY-MM` | no — lasts to `expiresAt` | `MONTHLY_STOCK_DEADLINE_DAY` | manager, if `LATE_STOCK_GRANT_BY_MANAGER` |
| `SECONDARY_SALES` | `YYYY-MM` | no | same (figures and files) | same |

A manager can grant only for someone in their own team. Length: `LATE_*_GRANT_VALID_HOURS` by default, at most `LATE_*_GRANT_MAX_HOURS`; a daily plan's never runs past the end of its business day.

## Period locks

A grant is refused (`409 GRANT_PERIOD_LOCKED`, with the reason) when the period is future, in a closed financial year, or settled downstream. Guards are added at wiring time by the modules that own the state (`container.ts`):

- **Plans** — Payroll's run for the month is finalized; or the employee's expense month is finalized or has a paid row (TA/DA is computed from the plans). A month merely *sent* does not lock plans (it can be sent back).
- **Expenses** — the month is finalized for payout, or any row is paid.
- **Stock / secondary** — no guard yet.

The same check runs when an exception is used, and a locked period counts as having no exception. Finalizing payroll or expenses emits `period.settled`, which ends the month's still-open exceptions.

## API

`/api/late-grants`: `GET /kinds`, `GET /preview?userId&kind&periodKey` (is the period still open, and why not), `POST /`, `GET /` (filters `userId`, `kind`, `month`, `status`), `POST /:id/revoke`. Admin, HR and Accountant read all; a field user reads their own and their team's. `/planning/late-grants` and `/field-activity/expense-grants` are the older shapes over the same store.

### Bulk

`POST /api/late-grants/bulk` `{ userIds (1–500), kind, periodKey, reason, expiresAt? }` → `{ granted[], skipped[{ userId, code, reason }] }`. The period, financial year and end time are checked once up front (a bad request is a `400`, nothing written). Then each employee goes through exactly the single grant's rules; one who can't be granted is skipped, not failed: `GRANT_PERIOD_LOCKED` (payroll/expenses settled), `ALREADY_OPEN`, `NOT_ELIGIBLE` (unknown, inactive or not field staff), `FORBIDDEN` (a manager's grant outside their team, or managers not allowed for this kind). Any other error stops the batch. `GET /api/late-grants/eligible?scope=all|team&managerId=` lists the active field employees a shortcut stands for (Admin: everyone, or one team; a manager: their own team).

## Enforcement points

`PlanSubmitter` (plans), `ExpenseMonthService` (send / approve), `assertMonthOpenForEntry` and `RecordMonthlyStockUseCase` (stock and secondary). Each asks for a usable exception only after the deadline has passed.
