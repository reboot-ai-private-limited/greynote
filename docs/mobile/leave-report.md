# Mobile — Leave report

How an employee looks back at their own leave: what they took, what is waiting, and what is left. There is no separate report endpoint; the phone builds the view from two self-scoped reads. Rules for applying are in [`leave.md`](leave.md). Related: [`financial-year.md`](financial-year.md).

**Status key:** ✅ built on the server. 📱 the phone still has to show it.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Balances:** `GET /hr/leave-balances/me?year=` gives, per leave type, `allocatedDays`, `usedDays`, `pendingDays` (reserved, waiting for approval) and `availableDays` for a leave year. | ✅ |
| 2 | **Leaves:** `GET /hr/leaves/me` lists the employee's own leaves, newest first, with dates, type, days, status and the approval trail. It follows the financial year in view (`X-Financial-Year`); dates outside it are `400 OUTSIDE_FINANCIAL_YEAR`. | ✅ |
| 3 | **Looking at an earlier year** = select it on the Financial Year screen; both reads then answer for that year, read-only. | ✅ |
| 4 | **Statuses** to show: *Waiting*, *Approved*, *Rejected*, *Withdrawn*, *Reopened*. `pendingDays` count against the balance until the leave is decided. | ✅ |
| 5 | **Cannot be edited** once approved or when its month's salary is finalized (`PAYROLL_FINALIZED`); a pending leave is withdrawn first, and a leave in a closed financial year is refused (`FY_CLOSED`). | ✅ |

## 2. What the phone should show

- Top: balance cards per leave type (`availableDays` of `allocatedDays`).
- Below: the year's leaves as a list, grouped by month, with a status chip; a tap opens the leave and its trail.
- A year switch that points to the Financial Year screen.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/hr/leave-balances/me?year=` | Own balances. |
| `GET` | `/hr/leaves/me` | Own leaves. |
| `GET` | `/hr/leaves/:id` | One leave. |
