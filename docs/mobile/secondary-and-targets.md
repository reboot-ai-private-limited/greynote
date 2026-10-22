# Mobile — Secondary sales and targets

How an employee's monthly **secondary** is entered and approved, and how **targets** and **achievement** relate to it. Online only. Decision: decision-log 2026-10-12.

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - Secondary Sales (units and amount, status per line and month, Send for approval, locked states) and read-only Targets with achievement; a manager can set and now **remove** a target.

## 1. Secondary (what the employee sold)

| # | Rule | Status |
|---|---|---|
| 1 | One figure per **product per month**: `GET /api/sales/employee-sales?userId=&month=` lists every active product with `secondaryQty`, `secondaryAmountPaise`, **`ptsPaise`** (and `ptrPaise`, for reference only) and `secondaryStatus`. | ✅ |
| 2 | **Units and amount are one figure at the product's PTS** (changed from PTR on 2026-10-14; use `ptsPaise`, not `ptrPaise`). Save with `POST /api/sales/employee-secondary` giving `qty` **or** `amountPaise` for each line; the server returns both. An amount is rounded to whole units and restated (units × PTS). A product with no PTS takes units only (`400 SECONDARY_NEEDS_PTR` for an amount). | ✅ |
| 3 | The employee's own entry is a **`DRAFT`**. They **send the month** with `POST /api/sales/employee-secondary/submit { month }`; every draft or rejected line becomes `PENDING` and a `SECONDARY_SALES` approval request goes to the **direct manager** (Admin may decide in their place). | ✅ |
| 4 | While `PENDING` or `APPROVED` the employee cannot change the month (`409 SECONDARY_LOCKED`). It opens again after a rejection, or when the request is withdrawn or Admin reopens it. A line a manager or Admin enters for the employee is `APPROVED` at once. | ✅ |
| 5 | **Only `APPROVED` secondary counts** toward achievement. Months entered before approval existed read as approved. | ✅ |
| 6 | Same window as before: the month must have started; after `MONTHLY_STOCK_DEADLINE_DAY` of the next month only Admin, or a month Admin reopened, takes entries. | ✅ |

Show a status chip per line and for the month (`secondaryStatus`: Draft / Waiting for approval / Approved / Rejected), a **Send for approval** button when the month is a draft or rejected, and an amount field beside the units that fills the other as the user types (`amount = units × ptsPaise`).

## 2. Targets

**Manager targets, 2026-10-14.** A manager (any designation above MR) has **no target of their own**: their target, achievement and primary are the **sum of every MR in their whole downline**, worked out when read (`GET /reports/employee-sales` for a manager returns the MRs' targets merged, one line per product and run of months, and `team: { mrCount }`; the Sales dashboard row carries `mrCount`). `POST /marketing/targets` for a manager is refused with `400` ("set the target on each MR"); `GET /marketing/targets/:userId` returns `[]` for a manager. A target a manager already has is ignored, not deleted (`report:manager-targets` lists them). The phone's manager targets screen should show the team total with a per-MR breakdown, hide **Set a target** for a manager row, and show "No MRs under you" when `mrCount` is 0. A manager still sets targets on the MRs in their team. **Editing (2026-10-22):** `PATCH /marketing/targets/:id` with `{ month, toMonth?, productId, targetAmountPaise | targetQty }` changes that target in place (product, months, amount or units; not the employee); `409 TARGET_CLASH` means the MR already has a target with that product and months: show the message and offer to edit that one. The phone's target list can offer Edit beside Remove (docs only; the app is another team's).

- Set by Admin, or by a manager for themselves and their team; an MR only reads. The phone shows them read-only.
- A target is **per product, for a run of months** of the current financial year, as an **amount or as units**: for a product with a PTS, one follows the other (`units × PTS = amount`) and both are returned (`targetQty`, `targetAmountPaise`). A target for **all products** is an amount only.
- **Achievement** = the employee's **approved** secondary for the product in those months, against the target — shown as amount % and, when the target has units, units %. It is computed when read, never stored.

## 2b. Per-distributor primary (2026-10-14)

The web employee report lists an employee's Done orders **by distributor** (`GET /api/reports/employee-sales` → `distributors[]`: `distributor`, `orderQty`, `orderPaise`), adding up to the order part of their primary. Secondary is still one figure per product, not per distributor. A manager sees this for their downline through the same endpoint; the phone may show it on the employee's sales screen (📱).

## 2c. Achievement now comes from the distributors (2026-10-14)

An employee's **achievement per product is the sum, over the distributors handed to them, of that product's secondary** (opening + units delivered, free included, − closing, from the distributor's stock statement or count), valued at **PTS**. The secondary the employee enters on the phone (and its approval) is kept as a record but **no longer counts** toward targets: label it informational, or hide it (📱). `primary` is now **supplied × price** (see [`orders-and-stock.md`](orders-and-stock.md)); units include free goods. Targets are still set by Admin or a manager (Sales dashboard > employee > Set a target on the web; the field app's targets screen for a manager).

## 3. Refs

[`LLD/sales-and-orders.md`](../LLD/sales-and-orders.md), [`LLD/marketing.md`](../LLD/marketing.md), [`orders-and-stock.md`](orders-and-stock.md), sign-off E1.
