# Reports

Read-only reports for the Admin: orders, and (as they are built) the sales, stock, TA/DA, DCR and salary reports. Decisions: sign-off K21, K23, K24, K27–K31, K33; decision-log 2026-10-07.

## What it owns

Nothing is stored. A **read model** at the top tier (7), above Payroll and Marketing so a report can read them: it asks Sales, Field Master Data and Identity (and later Field Activity, Payroll, Marketing) through their public contracts and joins names onto ids. It writes nothing; the one write on the Orders page (Done / Cancel) goes straight to Sales' existing endpoints.

## Rules for every report

- **Admin only** for the org-wide reports (K24); an employee reads their own TA/DA and DCR through `/reports/me/*` (FIELD only, the actor's id, never a `userId`, K24a); the calendars in Attendance stay Admin, HR and Accountant.
- **The financial year in view, by month** (K27): no free date range; a month outside the selected year is refused (`scopeToFinancialYear`).
- **CSV** export (K28); gaps are shown as gaps, never as zeros.

## Definitions (K9, K21, K23, K31)

- **Primary** = orders **to distributors** marked **Done**, in the month marked Done; Placed ones are shown in their own column; Cancelled never counts.
- **Secondary** = what the distributors sell on, derived per distributor and product from its stock: opening + primary received − closing. A missing count is a gap.
- A **chemist order** is information only: in neither figure, no supplying-distributor field, nothing sent on.

## Built: the Orders report

`GET /api/reports/orders?month=&type=&status=&mrId=` — one month of orders by **order date**, each with the MR and outlet named, plus totals by status (count and amount), capped at 2000 rows (`truncated` says when it may be short). `GET /api/reports/orders/:id` — one order in full with product names and who finished it. Names come from Identity's `getUserSummaries` and Field Master Data's `listNames` (three queries however many rows). Web: `/orders` (Admin and the Accountant, who can also Done / Cancel), two tabs — *To distributors* and *Chemist orders* — month, status and MR filters, status totals as tiles, an order dialog, Done / Cancel for a placed distributor order, CSV.

Added to the modules below for it: Sales `listOrders` and `getOrder` (contract), Field Master Data `findByIds` on the Distributor, Chemist and Product repositories and `listNames` (contract).

## Built: the Sales report and its chart (K29)

`GET /api/reports/sales?year=` (the year it starts in; scoped to the financial year in view) — the twelve months of the financial year, each with `primary` (Done orders to distributors, by the month marked Done, quantity and the order amounts), `placed` (orders placed that month and not yet Done), `secondary` (derived from the distributors' counts: opening + primary − closing, valued at PTR), how many of the expected (active) distributors counted, whether the month is complete, and the counts that came out negative (left out of the totals) or had no PTR (left out of the value). A month in progress has primary and no secondary; a future month has nothing; a month with no counts has primary and a *gap*, not a zero. Optional `distributorId` and `productId`. `GET /api/reports/sales/statement?month=` — one month per distributor and product: opening, primary, placed, closing, secondary, with flags `NO_COUNT`, `NEGATIVE_SECONDARY`, `OPENING_MISMATCH` (opening is not the previous month's closing), `UNPRICED`; and the active distributors with no count at all.

The arithmetic is pure (`domain/salesFigures.ts`, tested). Sales added `sumDistributorOrders` (a Mongo aggregation by the month marked Done in the business timezone, checked against the sample data to the rupee) and `listStockRange`; Field Master Data added `listActiveOutlets`.

Web `/reports/sales`: value / quantity switch, distributor and product filters, year totals, the **grouped bar chart** (a primary bar beside a secondary bar for each of April to March, drawn as SVG; the secondary bar of an incomplete month is hatched; future months empty; each month openable from the keyboard), the same numbers in a table under it, and, for the month clicked (the latest ended one by default), the statement with who did not count; CSV for the year and for the statement.

## Built: the Stock report

`GET /api/reports/stock?month=` — every count of the month for distributors and chemists, with the previous month's closing beside the opening, flags for a mismatch and (distributors) a negative secondary, a row `NO_COUNT` for each active outlet that did not count, and completeness (counted of expected, per outlet type). Web `/reports/stock`: month, "only what needs attention", tiles, table, CSV. A chemist's counts are information only.

## Built: the TA/DA report

`GET /api/reports/ta-da?year=` — for the financial year in view, each month (and each employee's month) of **accepted** expenses by the day reported: TA, DA, manual reimbursements (travel, meals, other), the total, how much is paid and how much unpaid (total = paid + unpaid), and the number of TA rows whose route distance could not be calculated (an artificially low amount, already recorded by Field Activity). "Accepted" is the same set the Accountant audits and pays — past the manager and not sent back; cancelled rows never count. `GET /api/reports/ta-da/days?userId=&month=` — one employee's accepted rows for a month, day by day, with the route name, status and paid date. It only reads; paying is done on the Expense payouts screen, which the report links to. Field Activity added `summarizeExpenses` (a month-grouped aggregation) and `listAcceptedExpenses` to its contract. No "unusual claim" flag, by the owner's choice (K28).

Web `/reports/ta-da`: year tiles (TA, DA, paid, unpaid), a month table with a paid-share bar, the selected month's employees (largest first), and a dialog with the employee's days; CSV for the year, the month's employees and one employee's days.

## Built: the DCR (daily reports) report

`GET /api/reports/dcr?year=` — for the financial year in view, each month and each employee's month: **days reported** (a daily report that is submitted or approved; a draft, rejected, withdrawn or reopened one is not a reported day, and its calls are left out), **doctor calls, chemist calls, follow-ups, calls per reported day**, **days submitted late** (after the day itself, in the business timezone, from the approval's submit time), and how the **server's geofence** judged the calls (passed, overridden by a manager, unverified, failed; "could not confirm" = failed or unverified, not overridden). `GET /api/reports/dcr/coverage?userId=&month=` — the doctors assigned to the employee **now** that they did not call on in the month, by speciality. Calls only, no sample quantities, as the owner chose (K28). Missed days stay on the Attendance screen.

Added below it: Approval `listForRecords` (a bulk read of requests by kind and record ids), Field Activity `summarizeDcrs` and `listCalledDoctorIds` (a handful of queries however many reports; the business timezone is read once, not per report — the first version took over ten seconds on the sample data), and call/follow-up counting by report. Web `/reports/dcr`: tiles, a month table and, for the month clicked, the employees with a **geofence bar** (the share confirmed, with the four results in its tooltip), "Doctors not visited" per employee, CSV for the year, the month and the doctors list. Coverage uses today's assignments, so a past month is judged against who is assigned now.

## Built: the Salary report

`GET /api/reports/salary?year=` — for the financial year in view, each month and each employee's run. **Finalized runs are the figures:** base, unpaid-leave deduction, absent deduction, net pay, the employer's EPF/ESI for the month (the CTC's employer lines ÷ 12, from the frozen breakdown) and the **cost to the company** (net pay + employer contributions). A month is `FINAL` (every run finalized), `DRAFT`, `PARTIAL`, `NONE` (ended with no run), `OPEN` or `FUTURE`; the **net pay of draft runs is shown apart** (`draftNetPaise`) and never added into the figures or the year's totals. Beside the salary, each month carries the **accepted TA, DA and reimbursements** by the day reported (the TA/DA report's figures), so the chart can stack what the field force cost. Rows list every run, drafts included and marked, with the run id for the salary slip. Payroll added `listRunsForReport` (light rows, no cap of 1000).

Web `/reports/salary`: year tiles (net pay, cost to company, deducted, months not yet final); a **stacked bar chart**, one bar per month — net salary (finalized, solid; draft, hatched) with TA, DA and reimbursements on top — switchable to the deductions (unpaid leave and absent days); the month table with status, base, deductions, net, employer contributions, cost to company and the draft net not counted (click a month to look at it alone); and each employee's net pay month by month, each cell opening the salary slip, draft cells in italics and left out of the year column. CSV for the months and for every employee's runs. Generating and finalizing stay on Payroll, which the page links to.

## All five reports

Orders, Sales (with the primary/secondary chart), Stock, TA/DA, DCR and Salary are built. Not built, by choice or not asked: charts for TA/DA and DCR (their tables carry paid-share and geofence bars), Excel export (CSV only, K28), per-manager roll-ups (Admin only for now, K24).

## Sample data for development

`pnpm --filter @greynote/api seed:sample-sales` (dry run) / `-- --apply` / `-- --remove` fills a **development** database with clearly-labelled sample sales data: three distributors and four chemists (names start with "SAMPLE"), three new products with prices beside the existing one, orders for the financial year so far (mostly Done, some Placed, a few Cancelled; remarks "SAMPLE DATA") and the monthly stock counts that follow from the Done orders, accepted TA, DA and meal claims, doctors with their assignments, calls, follow-ups and approval records for the sample daily reports (some late, some drafts, a few rejected, the last days only submitted), route assignments and salary runs (finalized to last month's before, drafts for last month) for the three sample MRs, with one distributor's last ended month left without counts to show a gap. It refuses to run in production and does nothing if the samples are already there. Added 2026-10-07 to give the Orders page and the reports something to show.


## Built: the Sales Dashboard (2026-10-09)

`GET /api/reports/sales-dashboard?from=&to=&search=&page=&pageSize=` — **Admin** (every active field employee) or a **manager** (their downline, never themselves; a field employee without a team gets 403). Field employees only — Identity's `listFieldEmployees` returns users with the FIELD role, so office staff never appear. `from`/`to` are `YYYY-MM-DD`, at most 93 days; `to` is held to today, and the response says the range actually read and the `month` (of the last day) the target and achievement columns are for. The route is scoped to the financial year in view (`kind: 'date'`, `fill: false`).

Each row: employee, designation, zone name, the Route names in the range's day plans, `workingDays`, `plan` and `dcr` (`submitted`, `approved` counts over working days only), `taPaise`, `daPaise` (Field Activity `summarizeTaDaByUser`: accepted, paid and unpaid, cancelled left out), `targetPaise` and `achievedPaise` (`null` = not set). Working days come from Attendance's day statuses: BEFORE_JOINING, HOLIDAY, WEEKLY_OFF and LEAVE are not working days. The page of rows does the per-employee reads (attendance, plans, reports); `totals` (employees, TA, DA, target, achievement) cover every matching employee, not just the page. Planning's `listDailyPlanDays` now also returns `routeIds`.

Web `/reports/sales-dashboard`: tiles, a Today / Last 7 days / Custom filter (`DateRangeFilter`), search, the table with a **Set** button per row (target and achievement for a month of the current year; disabled in a past financial year), CSV of the page.

## Built: the Doctor visits report (2026-10-10)

`GET /api/reports/doctor-visits?month=&userId=` (Admin and FIELD; the report limits the reader). Each Doctor with a `visit_frequency` (1–4 since 2026-10-22; each row also has a `stage`: `COMPLETE`, `IN_PROGRESS` or `NOT_STARTED`) against the calls made in the month: per employee the **quota** (sum of frequencies), **made**, **missed** (`frequency − made`, never below 0) and how many doctors are done; per doctor the same. Only calls on **reported** daily reports count (submitted or approved, the DCR report's rule). `made` is capped at a doctor's frequency, so extra calls on one doctor never hide a miss on another. A doctor is judged against the MR it is assigned to **now**. Admin reads any field employee (or all); a manager reads themself and their downline; an MR only themself (403 otherwise). It reads Field Activity `countDoctorCalls` (calls per doctor over the month; new index `{doctorId, reportDate}` on doctor calls) and Field Master Data `listAssignedDoctors` (now carrying `visitFrequency`). **The phone's "Missed calls" section calls this with `userId` = the signed-in MR**; a manager's app omits `userId`. Web `/reports/doctor-visits` (month, tiles, employee table with a Doctors dialog, CSV) and a Visits tab on the doctor screen. **Planned and missed (2026-10-10):** each doctor row also carries `plannedDays` (days on an approved daily plan this month, up to yesterday) and `missedSince` (the day first planned and never called on or after — the missed call carried forward), read from Planning `listPlannedDoctors`; the dialog and CSV show both. **Not in plan (2026-10-10):** the DCR report's figures carry `notInPlan` (Doctor Calls to a doctor who was not on the day's plan), shown as a column, a tile and a CSV column.

## Team overview (2026-10-12)

`GET /api/reports/team/overview?month=YYYY-MM&scope=direct|indirect|all&userId&search&page&pageSize` — ADMIN, FIELD. A manager's month at a glance: the Sales Dashboard read for the month (so the same audience rule: Admin sees all active field employees, a manager only their downline, a manager with no team gets 403) with each row extended by `field` (reported days, late days, doctor and chemist calls, follow-ups, calls per day, unconfirmed = geofence fail + unverified, not-in-plan and off-route counts; reported days only) and `attendance` (present, leave, absent, strike, off). `scope` narrows a manager's level (depth 1 = direct); `userId` narrows to one person who must be in the downline whatever the level (403 otherwise). The dashboard read also takes `scope` and `userId` now. A running month is read up to today. Honours `X-Financial-Year`. The Team module reads it through `reports.public.ts` (`readTeamOverview`) for the person page.

## Accountant reads, primary by distributor, PTS (2026-10-14)

`GET /api/reports/sales-dashboard` and `GET /api/reports/employee-sales` now allow the ACCOUNTANT (read only; `audience()` and `assertMayRead` treat the Accountant like Admin). The employee report adds `distributors[]` (`distributor`, `orderQty`, `orderPaise`: Done orders to each distributor in the months, adding up to the order part of `totals.primaryPaise`). Secondary and achievement are valued at **PTS** (the `valued at PTR` wording above is superseded); flags are `NO_PTS` and `NO_PTS_CHANGE`. See decision-log 2026-10-14.

## Achievement from distributors' secondary (2026-10-14)

`DistributorAchievement.entries(userIds, fromMonth, toMonth)` builds, for each employee, product and month, the sum of the secondary of every active distributor handed to them (`MasterPort.listDistributorAssignees`), reusing `buildStatement`/`stockFigure` (Admin's statement, else field counts; negative left out; no count adds nothing). The rows are shaped like the employee's own entries so `secondaryOf` values them at PTS. `EmployeeSalesReport` and `SalesDashboardReport` use it for secondary, achievement and target achievement; the employee's entered secondary only feeds nothing there any more (Admin's primary adjustment still comes from the employee entries). The Orders report and Team orders show a Done order's delivered amount (`suppliedAmountPaise`) and, per line, `suppliedQty`/`freeQty`.

## A manager's figures are the sum of their MRs (decision-log 2026-10-14)

`MrRollup.scopes(userIds)` (`application/mrRollup.ts`) maps each person to the ids whose figures are summed: an MR to themselves, a manager (designation level above MR) to every **MR in their whole downline** (managers in between are left out, so nothing is counted once per level). The Sales dashboard reads targets, orders, Admin changes and distributor secondary once for all those ids and builds each row from its own scope; `mrCount` is `null` for an MR, `0` for a manager with no MRs (shown as no figures, not 0%). The totals add each MR once. The employee report does the same for one manager, merges the MRs' targets into one line per product and run of months, and returns `team: { mrCount }`. `Selection.userIds` carries a set of employees into `primaryOf` / `secondaryOf`. Identity's `getDesignationLevels` is the only new read. The hierarchy is live: an MR who moved counts for today's manager.
