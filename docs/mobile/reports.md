# Mobile — Looking at a past day, month or year

How an employee reads back **their own** daily report (DCR), secondary sales, orders and monthly expenses: today's, an earlier day's or an earlier year's. All of these are existing self-scoped reads; nothing new on the server. Related: [`dcr.md`](dcr.md), [`secondary-and-targets.md`](secondary-and-targets.md), [`orders-and-stock.md`](orders-and-stock.md), [`expenses.md`](expenses.md), [`financial-year.md`](financial-year.md), [`leave-report.md`](leave-report.md), [`service-requests.md`](service-requests.md), [`docs.md`](docs.md).

**Status key:** ✅ built on the server. 📱 the phone still has to show it.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Pick the day or month, then ask.** The phone sends the range; the server answers for the signed-in employee only. A manager's team views are separate (`/field-activity/dcr/team`). | ✅ |
| 2 | **An earlier year** is reached through the Financial Year screen (`X-Financial-Year`). Everything below then answers for that year and is read-only. Without the header, ranges and months must fall inside the current year or the answer is `400 OUTSIDE_FINANCIAL_YEAR`. | ✅ |
| 3 | **A day's report:** `GET /field-activity/dcr?from=YYYY-MM-DD&to=YYYY-MM-DD` (own when no `userId`); one day = same date twice. Open one with `GET /field-activity/dcr/:id` for its calls, follow-ups, expenses, remarks and approval status. | ✅ |
| 4 | **Secondary sales:** `GET /sales/employee-sales?userId=<own id>&month=YYYY-MM`: the month's entered secondary per product and the target achievement. | ✅ |
| 5 | **Orders:** `GET /sales/orders?from&to&status`, for a manager this also returns their downline's orders mixed in, so the Team section uses `GET /team/orders` ([`team.md`](team.md)) instead; `GET /sales/orders/:id`. | ✅ |
| 6 | **Monthly expenses and their approval:** `GET /field-activity/expense-months?month=YYYY-MM` (own when no `userId`) gives the month's lines, totals, status (*Draft, Submitted, Approved, Paid*) and approval trail; `GET /field-activity/expense-months/history` lists the last twelve months across a year end; `/expense-months/:id` opens one. | ✅ |
| 7 | **Monthly stock** (distributors): `GET /sales/monthly-stock?month` and `/monthly-stock/missing`. | ✅ |
| 8 | **Plans:** `GET /planning/daily?from&to`, `/planning/daily/:id`, `/planning/monthly`. | ✅ |
| 9 | **Leave and services:** see [`leave-report.md`](leave-report.md) and [`service-requests.md`](service-requests.md). | ✅ |
| 10 | **Payslips and documents:** see [`docs.md`](docs.md). | ✅ |
| 11 | **Not available to the employee:** the portal's `/reports/*` (TA/DA, salary, coverage, stock, DCR reports) are Admin/Accounts tools. Four own-data routes are open to an employee, FIELD only, always the signed-in user (no `userId`), bound to the financial year in view (current by default; older years read-only through `X-Financial-Year`): `GET /reports/me/ta-da?year`, `/reports/me/ta-da/days?month`, `/reports/me/dcr?year` and `/reports/me/dcr/coverage?month` (same shapes as the Admin `/reports/ta-da`, `/ta-da/days`, `/dcr`, `/dcr/coverage`). Leave is `/hr/leave-balances/me`; targets are `/reports/employee-sales` with their own id. Three more are open to an employee for themselves (and to managers for their team): `/reports/doctor-visits`, `/reports/employee-sales` and `/reports/sales-dashboard`. | ✅ |

## 2. What the phone should show

- A calendar or month picker on the Reports tab: tap a day → that day's report, with a status chip (*Draft, Submitted, Approved, Rejected*) and its trail.
- A month view with three cards: secondary sales vs target, expenses with approval status, and orders.
- A year switch that opens the Financial Year screen; the banner stays on every screen while a past year is selected.

## 3. Known gaps

- There is no single "day at a glance" endpoint: the day screen makes up to four reads (DCR, orders for the date, plan, expense lines). If that proves slow on a real phone, add one.
- The reports above are read live; there is no export or PDF on the phone.
