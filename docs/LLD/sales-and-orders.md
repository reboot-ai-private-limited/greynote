# Sales & Orders

Standalone order capture and monthly stock counting for Distributors and Chemists (PRD §6.2.B,
ERD Module 6). "Standalone" is the operative word: an Order is never tied to a specific
Chemist Call — it's logged as its own action — and unlike almost every other field-submitted
entity in this system, **nothing here goes through manager approval**.

## What it owns

- **`Order`** — a Stockist/Distributor or Chemist order, itemized via `OrderItem`. Attaches to
  exactly one of `distributor_id`/`chemist_id` (never both, never neither). Lifecycle:
  `PLACED → DONE` or `PLACED → CANCELLED`.
- **`OrderItem`** — one line per product on an order: `product_id`, `quantity`, `unit_price`,
  `amount`.
- **`MonthlyStock`** — one row per (outlet, product, month): `opening_qty`, `closing_qty`, same
  polymorphic distributor/chemist attachment as `Order`.

Full fields, types and the ER diagram: [`../erd/06-sales-and-orders.md`](../erd/06-sales-and-orders.md).

## Public contract

Following the shape in [`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) —
`health.public.ts`'s `HealthPublicContract` is the reference shape. This module's tier-4 slot in
`apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS` is named `sales`, so its contract file is
`sales.public.ts` exporting `SalesPublicContract`.

What it's likely to expose, once built — this module has no consumers yet among the other 9, so
the contract starts narrow and grows on demand (per
[`../engineering/adding-a-module.md`](../engineering/adding-a-module.md)):

- Read-only reporting queries for the Web Portal's Marketing/Sales reports (PRD §6.3, "Gift &
  Sales Reports") — order history and a computed Secondary Sales figure per outlet/product/month.
- Nothing this module needs to expose *inward* is currently identified: no other tier-4 or
  tier-5 module reads Order/MonthlyStock data as an input to its own logic (Marketing's Target
  tracking is against Targets, not against realized Orders — see
  [`marketing.md`](marketing.md)).

## Write-path rules & invariants

- **Exactly one of `distributor_id`/`chemist_id` is set on both `Order` and `MonthlyStock`** — a
  DB-level or application-level XOR check, matching the ERD's stated constraint. Reject a create
  with both or neither set as a `400`, not a silent null-coalesce.
- **`Order.total_amount` is denormalized from its `OrderItem` rows** — application logic keeps it
  in sync on every item add/edit/remove; it is never independently editable.
- **The `PLACED → DONE`/`PLACED → CANCELLED` transition is a completion action, not an approval
  action** — same shape as Field Activity's `DoctorGift` (Admin-issued, MR marks it `DONE`), not
  the Nearest-Manager-then-Admin state machine in
  [`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md). This module
  does not call into the Approval Workflow Engine at all — say so explicitly in code review when
  someone new to the module assumes it does, since every *other* field-submitted entity in this
  system does.
- **No manager approval on create, ever** — PRD §6.2.B / §5.3.1 both state this plainly. An Order
  or MonthlyStock row is visible and actionable the moment it's written.
- **`MonthlyStock` is one row per (outlet, product, month)** — a second submission for the same
  key is an update, not a new row (see Edge cases).
- **Monthly stock has a submission deadline set in `SystemConfig`.** Field staff enter each
  Distributor's per-product opening/closing stock once a month (client rules §14–15; client
  `sales.docx` S6: "Monthly One Time Entry"). The cut-off is Admin-configurable, not hard-coded:
  - **Deadline (decision-log 2026-10-03, replacing the 2026-09-30 "last day + grace days"):** month *M*'s
    counts are due by the end of day `MONTHLY_STOCK_DEADLINE_DAY` (seed `5`, 1–28) of the **following
    month**, in the business timezone. A future month is refused. Chemists and Distributors are counted
    alike, per Product, opening and closing. The stock-check script is run the day after the deadline.
  - After the cut-off, a create/update for month *M* is rejected (`409`), unless Admin has
    re-opened that month. The client spec says re-open goes "only through Approval (if enabled)"; until
    that approval exists, it's an Admin-only unlock.
  - Missing submissions are **reported** to the Manager (Secondary, §15.5) / Admin (Primary, §14.5) —
    `GET /sales/monthly-stock/missing` and the `sales:stock-check` job. That's a report, not a DCR
    block, unlike HLD 10's compliance block; notification delivery waits for F8.
  - **Who enters:** an MR for the Chemists and Distributors on their Routes
    (`canActOnChemist` / `canActOnDistributor`); Admin for any; managers read their team's counts.
    Stock is a `MONTHLY_STOCK` record kind in the daily push, checked against the deadline when the
    push arrives.
- **Who may submit or order for a Distributor:** a user for whom
  `FieldMasterDataPublicContract.canActOnDistributor` is true — the Distributor's
  `assigned_user_ids`, or an MR whose `RouteAssignment` covers any of its Routes — plus anyone above them in
  the reporting chain (client `sales.docx` S6: "MR → own Distributor, Manager → team Distributor,
  Admin → all"). Chemist orders use the same Route-coverage rule.
- **Secondary Sales is never written directly.** It's a derived report:
  `opening_qty + primary sales received during the month − closing_qty`, computed at read time
  from `MonthlyStock` plus that period's `Order` rows for the same outlet/product. This module
  owns the two inputs; it does not persist the derived figure anywhere.
- **Money.** `unit_price`, `amount`, `total_amount` are money: whole numbers of **paise** (decided
  2026-09-29), named `…Paise`; see
  [`../engineering/coding-standards.md#money`](../engineering/coding-standards.md#money). A line's
  amount is `quantity × unitPricePaise`, an integer.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/sales/orders` | MR | Create an Order with its lines, status `PLACED` (also the `ORDER` sync kind) |
| `GET` | `/sales/orders` | MR, Manager, Admin | List Orders (MR: own; manager: plus downline's; Admin: all); filter by status, dates, outlet |
| `GET` | `/sales/orders/:id` | MR, Manager, Admin | Order detail with lines; not visible = `404` |
| `GET` | `/sales/distributor-statement` | Admin, Accountant (read) | A distributor's month: opening, primary, secondary, closing; saving stays Admin |
| `POST` | `/sales/orders/:id/complete` | MR (own), Admin, Accountant (any) | Transition `PLACED → DONE`, sets `completed_by`/`completed_at` |
| `POST` | `/sales/orders/:id/cancel` | MR (own), Admin | Transition `PLACED → CANCELLED`, same fields |
| `POST` | `/sales/monthly-stock` | MR, Admin | Record/update opening+closing counts for one outlet, one month, several products |
| `GET` | `/sales/monthly-stock` | MR, Manager, Admin | List stock counts, filterable by outlet/product/month |
| `POST` | `/sales/monthly-stock/unlock` | Admin | Re-open a past month for entry |
| `GET` | `/sales/monthly-stock/missing` | Manager, Admin | Outlets with no count for a month, by MR |
| `GET` | `/sales/reports/secondary-sales` | Admin | Derived Secondary Sales figures over a period |

Exact role gating (whether HR/Accountant get any read access here) follows PRD §5's "Sales
managers are explicitly excluded from web-portal workflows" framing — this module's Web Portal
surface, if any beyond Admin reporting, is Admin-only by default until stated otherwise.

**As built (2026-09-30):** an Order's lines are embedded in the Order document (one write, so the total can
never disagree with the lines; the database itself refuses a total that is not their sum). Only an MR places an
Order — it belongs to them, so Admin cannot. Unit price is entered by the MR (there is no price list yet) as whole
paise; the server multiplies. The order date defaults to today and may be in the past, never the future.
Completing/cancelling is one conditional update, so of two racing calls exactly one wins and the other is a `409`;
a manager may open a team member's Order but only its MR or an Admin may finish it. Completing/cancelling is online
only. Blocked (missed-DCR) MRs are not stopped from ordering — orders are not part of the DCR.

## Edge cases

- **Completing or cancelling an Order twice.** The second `POST .../complete` or `.../cancel` on
  an already-`DONE`/`CANCELLED` order is a `409`, not a silent no-op — the caller's assumption
  about current state was wrong and should surface, not be swallowed.
- **Cancelling a `DONE` order.** Not a valid transition (`PLACED → CANCELLED` only) — once
  fulfilled, reversing it is a new business action (a return/adjustment), not a state-machine
  edge this module needs to model in its first build. Reject with a clear message rather than
  silently allowing `DONE → CANCELLED`.
- **A second `MonthlyStock` submission for the same (outlet, product, month).** This is an
  **update** to the existing row, not a duplicate — the write path must look up the existing key
  before insert. Two different MRs submitting for the same key in the same month (e.g., during a
  route handoff) both land on the same row; the second write simply overwrites, and `recorded_by`
  reflects the most recent submitter. If auditability of who-changed-it-when later matters, that's
  an addition to this rule, not a reason to allow duplicate rows now.
- **An Order for a Distributor/Chemist outside the submitting MR's assigned territory or direct
  assignment.** Rejected with `403`. Resolved 2026-09-24 from client rules §17.3 — see the
  "Who may submit or order" rule above. `Order` still stores no link to `RouteAssignment`; the
  check runs at write time only.
- **A month's counts arriving after the deadline day of the following month (`MONTHLY_STOCK_DEADLINE_DAY`).** Rejected unless re-opened.
  If Admin changes the config value mid-month, the new value applies to any month not yet
  closed. A month already past its old cut-off doesn't silently re-open.
- **Money precision drift between `unit_price × quantity` and `amount`.** Compute `amount`
  server-side from `unit_price` and `quantity` rather than trusting a client-supplied value —
  otherwise a rounding or unit mismatch on the client silently corrupts `total_amount`.

## Dependencies

- **Field Master Data** (Tier 3) — `Distributor`, `Chemist`, `Product` referenced by `Order`/
  `OrderItem`/`MonthlyStock`. This is the load-bearing dependency; see
  [`field-master-data.md`](field-master-data.md).
- **Identity** (Tier 1) — the submitting/completing `User` (`user_id`, `completed_by`,
  `recorded_by`), plus the reporting-chain lookup for manager access.
- **Config** (Tier 0) — `MONTHLY_STOCK_DEADLINE_DAY`.

Not a dependency: the Approval Workflow Engine, Offline Sync & Geofencing (Orders/stock counts
are not stated as geofenced the way Doctor/Chemist Calls are in PRD §5.1 — they're captured, not
location-verified).

## Deliberately deferred

- **Return/adjustment handling for a `DONE` order.** Out of scope for the first build; see the
  cancel-after-done edge case above.
- **The approval-based re-open of a closed stock month.** The client spec mentions it "if
  enabled"; until then it's an Admin-only unlock.
- **Any auditing of `MonthlyStock` overwrites** beyond `recorded_by`/`recorded_at` reflecting the
  latest write.
- **The Secondary Sales computation's exact formula and edge handling** (multiple orders in a
  month, a month with no opening count on file) is a reporting-layer concern to nail down when
  the Web Portal's Sales report screen ([`../roadmap.md`](../roadmap.md) phase 9) is actually
  built, not before there's a consumer for it.

## Distributor monthly statement (2026-10-09)

Definitions, per distributor, product and month, in units: **Opening** = stock held at the start of the month; **Primary** = what the company sent to it (Done orders marked Done in the month + Admin's adjustment); **Secondary** = what it sold on; **Closing** = stock at month end; **Opening + Primary − Secondary = Closing**. Chemists are not part of these figures (K31).

Two sources feed one result (`shared/stock/stockFigures.ts`, used by the grid and by the Sales report):
- **Field count** — `MonthlyStock`, unchanged: any field employee who may act on the distributor submits opening and closing; secondary is derived (`opening + primary − closing`).
- **Admin statement** — `StockStatement { distributorId, productId, month, openingQty, secondaryQty|null, adjustmentQty, adjustmentReason, enteredBy/At, updatedBy/At, history[] }`, unique per distributor + product + month. Closing is never stored; it is `opening + primary − secondary`. A change keeps the old values in `history`.

**Precedence:** a statement that states a secondary is the figure used; otherwise the field count. When both exist and the field's closing differs from the derived closing the row carries `COUNT_MISMATCH`. Other flags: `NEGATIVE_SECONDARY` (count path), `NEGATIVE_CLOSING` (statement path), `OPENING_MISMATCH` (opening ≠ last month's closing), `UNPRICED`.

- `GET /api/sales/distributor-statement?distributorId&month` (Admin, financial-year scoped): every active product with the field count (who, when), the orders, the saved statement or a suggested opening (the count's, else last month's closing) and the resulting figures.
- `POST /api/sales/distributor-statement { distributorId, month, lines[] }` (Admin): distributor active, month started, financial year open, products active; an adjustment needs a reason; no deadline for Admin; an identical line is left alone.
- The field-count path (`POST /monthly-stock`, the phone's `MONTHLY_STOCK` record) now also refuses a month of a closed financial year (a sync `FY_CLOSED` rejection).

Web: the distributor's **Stock** tab (month, product grid, **Use field count**, Save) and the Sales report's statement (Adjustment, Source, new flags). The Stock report still shows the field counts only.

## Distributor payments (2026-10-09)

`DistributorPayment { distributor_id, payment_date, amount_paise, mode (CASH, CHEQUE, BANK_TRANSFER, UPI), reference?, note?, status (RECORDED, CANCELLED), recorded_by, cancel reason/by/at }`, entered by **Admin or Accountant** on the web (resolves sign-off E6: entered in this app). Never edited: a wrong entry is cancelled with a reason, once, and stays listed but out of the totals.

- `POST /api/sales/distributor-payments` — the distributor must be active, the date not in the future, and its financial year open (`FY_CLOSED`).
- `GET /api/sales/distributor-payments?distributorId&from&to` — the range's payments, `collectedPaise` (recorded ones) and `orderedPaise` (the distributor's non-cancelled orders dated in the range), scoped to the financial year in view.
- `POST /api/sales/distributor-payments/:id/cancel` `{ reason }` — one conditional update; the second cancel is a 409.

Web: the distributor's **Payments** tab (tiles, range filter, table, Record payment, Cancel) and **Orders** tab (its orders in the range). An MR does not record payments from the phone.

`GET /api/sales/distributor-payments/totals?from&to` (Admin or Accountant, financial-year scoped) returns what each distributor paid in the range, recorded payments only, one row per distributor that has any — the Distributors list's "Collected this month" column. The list rows also have a **Payment** button that opens the same Record payment modal, plus Edit and Deactivate / Reactivate shown in the row (distributors list only; the other tables keep their 3-dot menu).

## Employee figures (2026-10-10)

`EmployeeSale` (see the ERD) with `GET /api/sales/employee-sales?userId&month` (the month by product: `orderPrimaryQty` from `sumUserOrders` — Done orders to distributors by user, product and month marked Done — plus the adjustment and the secondary), `POST /api/sales/employee-secondary` (`SaveEmployeeSecondaryUseCase`: self, manager of the user, or Admin; month started, financial year open, whole units, active products; after the stock deadline only Admin or an unlocked month) and `POST /api/sales/employee-primary` (`SaveEmployeePrimaryUseCase`: Admin; reason needed for a non-zero change). Public contract adds `sumUserOrders` and `listEmployeeSales`. For distributors, the Stock tab's suggested opening is now last month's closing first, the field count's opening only when there is none.

## Orders, secondary approval (2026-10-12)

- **Chemist orders are information only.** `FinishOrderUseCase` refuses a chemist order with `409 ORDER_INFO_ONLY`; only a distributor order is marked done or cancelled (by its MR or Admin), and only a Done distributor order is primary.
- **Secondary is units or amount, approved by the manager.** `EmployeeSale` gains `secondaryAmountPaise` and `secondaryStatus` (`DRAFT` → `PENDING` → `APPROVED` / `REJECTED`; absent on old rows = `APPROVED`). `SaveEmployeeSecondaryUseCase` takes `qty` or `amountPaise` per line and links them at the product's PTR (`linkQtyAndAmount`: an amount is rounded to whole units and restated; no PTR means units only, `400 SECONDARY_NEEDS_PTR`). The employee's own entry is a `DRAFT` and is locked once `PENDING` or `APPROVED` (`409 SECONDARY_LOCKED`); a manager's or Admin's entry is `APPROVED` at once.
- `POST /api/sales/employee-secondary/submit { month }` (`SubmitEmployeeSecondaryUseCase`, FIELD): in one transaction every draft/rejected line becomes `PENDING` and a `SECONDARY_SALES` approval request is submitted (`recordId = userId:month`, `managerOnly`, so the direct manager decides and Admin may act in their place). `makeSecondaryStatusHandler` (the kind's `onStatusChange`) moves the lines: approved → `APPROVED`, rejected → `REJECTED`, withdrawn or reopened → `DRAFT`.
- **Achievement counts approved secondary only.** The public `listEmployeeSales` returns `secondaryQty: null` for any line not `APPROVED`; the employee read (`GET /employee-sales`) still shows every line with its status and the month's rolled-up `secondaryStatus`.
- The `Monthly stock` tab is removed from the phone (see [`mobile/orders-and-stock.md`](../mobile/orders-and-stock.md)); the `MONTHLY_STOCK` sync kind and endpoints stay.

## Reads for the manager's Team section (2026-10-12)

Public contract additions: `listMissingStock(month, userIds?)` (the Admin view, now narrowable to some people) and `listSecondaryStatus(month, userIds)` (each id answered; `monthSecondaryStatus` in `domain/employeeSale.entity.ts` turns a month's lines into one word: lines with no quantity are ignored, and the one that still needs somebody wins: `PENDING`, then `REJECTED`, then `DRAFT`; `APPROVED` only when every entered line is). The Team module (`GET /team/orders`, `GET /team/stock`) is the consumer. Note `GET /sales/orders` for a FIELD user returns their own and their downline's orders together.

## Part supply, free units, dues (2026-10-14)

- `OrderItem` gains `suppliedQty` (null until Done) and `freeQty`; `Order` gains `suppliedAmountPaise`. `deliveredOf(item)` (domain) is the read rule: supplied defaults to the ordered quantity, free to 0, so older Done orders read as fully supplied. The schema's pre-validate refuses `suppliedQty > quantity`.
- `FinishOrderUseCase.execute(actor, id, 'DONE', supply?)`: `supply` is Admin/Accountant only; it validates every product is on the order and `0 ≤ suppliedQty ≤ quantity`, then `OrderRepositoryPort.complete` does one conditional update (`status: 'PLACED'` and `editedAt` unchanged since the read, so a racing edit or Done wins cleanly) setting status, items, `suppliedAmountPaise`. Cancel still uses `transition`.
- Aggregations (`sumUserOrders`, `sumDistributorOrders` DONE side, `sumDoneByDistributor`) use `$ifNull(items.suppliedQty, items.quantity)`: amount = supplied × price, **quantity = supplied + free**. PLACED sums stay at ordered. So the stock statement, Sales report and employee primary need no logic change: their units include free goods and their rupees exclude them.
- Dues: `ListPaymentsUseCase` adds `dues { openingPaise, deliveredPaise, collectedPaise, duesPaise }` (all time; `PaymentRepositoryPort.collectedAllTime`, `OrderRepositoryPort.sumDoneByDistributor`); `GET /sales/distributor-payments/balances` (`DistributorBalancesUseCase`) feeds the list's Dues column (the web adds each distributor's `openingDuesPaise`). `orderedPaise` counts a Done order at what was delivered.

## Office orders, edit, PTS (2026-10-14)

- `PlaceOrderUseCase.executeFor(office, employeeId, input)` (`POST /api/sales/orders/on-behalf`, ACCOUNTANT/ADMIN): the employee must be an active FIELD user (`400/404 EMPLOYEE_NOT_FOUND`); the outlet must exist and be active (`OutletAccess.assertUsable` lets Admin and the Accountant past the Routes check). Stored with `userId` = the employee and `createdBy` = the office user. Shares `priceLines` with the employee path, so amounts and the active-product check are identical.
- `EditOrderUseCase` (`PATCH /api/sales/orders/:id`, ACCOUNTANT/ADMIN): replaces `items`, total and `remarks` of a `PLACED` order through `OrderRepositoryPort.update` (a conditional `updateOne` on `status: 'PLACED'`), setting `editedBy`/`editedAt`. A non-`PLACED` order is `409 ORDER_NOT_PLACED`; a FIELD user is `403`. The financial-year guard applies to the order's date. Chemist orders can be edited too (they stay information only).
- **Valuation is at PTS.** `linkQtyAndAmount(entry, ptsPaise)` links units and amount at PTS (`400 SECONDARY_NEEDS_PTR` kept as the code; the message says PTS). `EmployeeSalesLineDto` gains `ptsPaise` (the old `ptrPaise` stays for reference); `secondaryAmountPaise` is restated as units × PTS on read. Targets: `units × PTS = amount` in `SetTargetUseCase`. Reports: `secondaryOf` and `buildSalesMonths`/`buildStatement` value at PTS.
- `sumUserOrders` rows now carry `distributorId` (the group key adds the distributor); the employee sales report folds them into a per-distributor primary list.

## Planned free units, original order kept (2026-10-14)

`PlaceOrderUseCase.execute` forces `freeQty: 0` (employee); `executeFor` and `EditOrderUseCase` keep the office's `freeQty` on the line (`suppliedQty` stays null until Done). `EditOrderUseCase` passes `original` (the order's lines and total) to `OrderRepositoryPort.update` only when `originalItems` is not yet set, and updates with `ifEditedAt` so two editors cannot overwrite each other. `FinishOrderUseCase.complete` delivers an unnamed line in full with its planned free units. The Orders report detail returns `original` and `originalTotalAmountPaise`.
