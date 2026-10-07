# Reports

Read-only reports for the Admin: orders, and (as they are built) the sales, stock, TA/DA, DCR and salary reports. Decisions: sign-off K21, K23, K24, K27–K31, K33; decision-log 2026-10-07.

## What it owns

Nothing is stored. A **read model** at the top tier (7), above Payroll and Marketing so a report can read them: it asks Sales, Field Master Data and Identity (and later Field Activity, Payroll, Marketing) through their public contracts and joins names onto ids. It writes nothing; the one write on the Orders page (Done / Cancel) goes straight to Sales' existing endpoints.

## Rules for every report

- **Admin only** for now (K24); the calendars in Attendance stay Admin, HR and Accountant.
- **The financial year in view, by month** (K27): no free date range; a month outside the selected year is refused (`scopeToFinancialYear`).
- **CSV** export (K28); gaps are shown as gaps, never as zeros.

## Definitions (K9, K21, K23, K31)

- **Primary** = orders **to distributors** marked **Done**, in the month marked Done; Placed ones are shown in their own column; Cancelled never counts.
- **Secondary** = what the distributors sell on, derived per distributor and product from its stock: opening + primary received − closing. A missing count is a gap.
- A **chemist order** is information only: in neither figure, no supplying-distributor field, nothing sent on.

## Built: the Orders report

`GET /api/reports/orders?month=&type=&status=&mrId=` — one month of orders by **order date**, each with the MR and outlet named, plus totals by status (count and amount), capped at 2000 rows (`truncated` says when it may be short). `GET /api/reports/orders/:id` — one order in full with product names and who finished it. Names come from Identity's `getUserSummaries` and Field Master Data's `listNames` (three queries however many rows). Web: `/orders` (Admin), two tabs — *To distributors* and *Chemist orders* — month, status and MR filters, status totals as tiles, an order dialog, Done / Cancel for a placed distributor order, CSV.

Added to the modules below for it: Sales `listOrders` and `getOrder` (contract), Field Master Data `findByIds` on the Distributor, Chemist and Product repositories and `listNames` (contract).

## Built: the Sales report and its chart (K29)

`GET /api/reports/sales?year=` (the year it starts in; scoped to the financial year in view) — the twelve months of the financial year, each with `primary` (Done orders to distributors, by the month marked Done, quantity and the order amounts), `placed` (orders placed that month and not yet Done), `secondary` (derived from the distributors' counts: opening + primary − closing, valued at PTR), how many of the expected (active) distributors counted, whether the month is complete, and the counts that came out negative (left out of the totals) or had no PTR (left out of the value). A month in progress has primary and no secondary; a future month has nothing; a month with no counts has primary and a *gap*, not a zero. Optional `distributorId` and `productId`. `GET /api/reports/sales/statement?month=` — one month per distributor and product: opening, primary, placed, closing, secondary, with flags `NO_COUNT`, `NEGATIVE_SECONDARY`, `OPENING_MISMATCH` (opening is not the previous month's closing), `UNPRICED`; and the active distributors with no count at all.

The arithmetic is pure (`domain/salesFigures.ts`, tested). Sales added `sumDistributorOrders` (a Mongo aggregation by the month marked Done in the business timezone, checked against the sample data to the rupee) and `listStockRange`; Field Master Data added `listActiveOutlets`.

Web `/reports/sales`: value / quantity switch, distributor and product filters, year totals, the **grouped bar chart** (a primary bar beside a secondary bar for each of April to March, drawn as SVG; the secondary bar of an incomplete month is hatched; future months empty; each month openable from the keyboard), the same numbers in a table under it, and, for the month clicked (the latest ended one by default), the statement with who did not count; CSV for the year and for the statement.

## Built: the Stock report

`GET /api/reports/stock?month=` — every count of the month for distributors and chemists, with the previous month's closing beside the opening, flags for a mismatch and (distributors) a negative secondary, a row `NO_COUNT` for each active outlet that did not count, and completeness (counted of expected, per outlet type). Web `/reports/stock`: month, "only what needs attention", tiles, table, CSV. A chemist's counts are information only.

## Not built yet

TA/DA, DCR and Salary reports (K28, K30).

## Sample data for development

`pnpm --filter @greynote/api seed:sample-sales` (dry run) / `-- --apply` / `-- --remove` fills a **development** database with clearly-labelled sample sales data: three distributors and four chemists (names start with "SAMPLE"), three new products with prices beside the existing one, orders for the financial year so far (mostly Done, some Placed, a few Cancelled; remarks "SAMPLE DATA") and the monthly stock counts that follow from the Done orders, with one distributor's last ended month left without counts to show a gap. It refuses to run in production and does nothing if the samples are already there. Added 2026-10-07 to give the Orders page and the reports something to show.

