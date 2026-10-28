# Mobile — Orders and the Monthly stock tab

What the field app must do for orders, and what to **remove**: the *Monthly stock* tab. The server is the authority. The phone app is another team's and cannot be changed from this repo, so this note is the contract. Decision: decision-log 2026-10-12 (orders, secondary, targets, services).

**Status key:** ✅ built on the server. 📱 the phone still has to do it.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - orders show "Information only" for a chemist order with no Done or Cancel, Done or Cancel for a distributor order (**Done is withdrawn 2026-10-27**, see "Invoices"); the **Monthly stock tile is removed** (the `MONTHLY_STOCK` sync kind is kept in the queue code as the doc asks).

## 1. Orders

| # | Rule | Status |
|---|---|---|
| 1 | An MR places an order for a **Chemist** or a **Distributor** on their Routes (`ORDER` sync kind / `POST /api/sales/orders`). The server prices the order itself, at the product's **PTS for a distributor, PTR for a chemist** (2026-10-24); the unit price the phone sends is ignored unless the product has no PTS/PTR. The server computes line amounts and the total. | ✅ |
| 2 | A **chemist order is information only.** It is recorded and shown, but never marked done or cancelled: `POST /orders/:id/complete` and `/cancel` on a chemist order return **`409 ORDER_INFO_ONLY`**. Hide Done / Cancel for chemist orders. | ✅ |
| 3 | A **distributor order** starts `PLACED`. **Only the office (Admin or the Accountant) marks it Done**, with the invoice number (2026-10-27, see "Invoices" below); the MR who placed it may still **cancel** it. Only a **Done** distributor order is a primary sale. | ✅ |
| 4 | Done / Cancel is one-way: a second call returns `409 ORDER_NOT_PLACED` naming the state. | ✅ |
| 5 | **One outlet per order:** a distributor order names exactly one distributor; a chemist order exactly one chemist (the order form must not allow both, or a mix of outlets). Prefill the unit price with the product's **PTS for a distributor, PTR for a chemist** (a preview: the server re-prices from the catalogue, so an edit to it has no effect and the total to trust is the one the server returns after sync). | ✅ server / 📱 form |
| 7 | **Part supply and free units (2026-10-14).** When the office marks a distributor order Done it records, per line, `suppliedQty` (0 to ordered) and `freeQty`. The order the MR placed is unchanged (`quantity`, `unitPricePaise`, `amountPaise`, `totalAmountPaise`); a Done order also carries `suppliedQty`, `freeQty` per item and `suppliedAmountPaise`. Show the MR **Ordered / Supplied / Free / Not supplied (ordered − supplied)** and the delivered amount; a Done order with `suppliedQty` null (older) was delivered in full. Free units are never charged. | ✅ server / 📱 display |
| 9 | **Free units planned by the office, and the original kept (2026-10-14).** A Placed order may carry `freeQty` per item (planned by the office; an MR cannot set it, the field is ignored on `ORDER`). When the office changes an order, the employee's original lines are kept in `originalItems` and `originalTotalAmountPaise` (null if never changed): show "You ordered: …" from them beside the current lines. | ✅ server / 📱 display |
| 8 | ~~The MR's Done is a full supply.~~ **Replaced 2026-10-27: the MR can no longer mark an order Done.** `POST /orders/:id/complete` is Admin / Accountant only and needs an `invoiceNumber`; for an MR it is `403` (the route no longer lets the role in). **Remove the Done button** for distributor orders on the phone. Part supply (`supply`) is the office's, as before. | ✅ server / 📱 remove Done |
| 6 | **The office can add and change orders** (2026-10-14). Admin or the Accountant may add an order for an employee (`POST /api/sales/orders/on-behalf`) and change the lines, prices and remarks of a `PLACED` order (`PATCH /api/sales/orders/:id`) before marking it Done. The employee's list shows these orders after the next sync/refresh with the edited lines and total. A pending (not yet synced) phone edit of the same order loses to the server: if the order is no longer `PLACED` the sync returns `409 ORDER_NOT_PLACED`; show the server's state. Order objects gain `createdBy`, `editedBy`, `editedAt` (all nullable); the phone may show "Added by office" / "Changed by office". | ✅ server / 📱 display |

## 2. Remove the Monthly stock tab ✅

The *Monthly stock* tab (opening / closing counts per chemist and distributor) is **removed from the app**:

- Hide the tab and stop creating new `MONTHLY_STOCK` records. Stock for distributors is now an **Admin statement** on the web (opening + primary − secondary = closing), and an employee's secondary is entered on the web (or the phone's secondary screen, see [`secondary-and-targets.md`](secondary-and-targets.md)).
- The server still **accepts** `MONTHLY_STOCK` sync records, so a build that has not been updated yet does not break; they are no longer needed. Do not delete the sync kind from the app's queue code until every phone has updated.
- Chemist stock counts are not used in any figure.

## 3. Refs

[`LLD/sales-and-orders.md`](../LLD/sales-and-orders.md), [`LLD/sync.md`](../LLD/sync.md), sign-off E1, G1.

## Discounts (2026-10-15)

The office may discount a distributor order (per line and/or the whole order). The MR cannot set one (the field is ignored on `POST /sales/orders`). `GET /sales/orders[/:id]` items carry `discount` (`{type:'PERCENT',percent}` or `{type:'FIXED',amountPaise}`), `netAmountPaise` and, on a Done order, `suppliedNetPaise`; the order carries `discount` and `orderDiscountPaise`. `amountPaise` is still ordered × price (gross); **`totalAmountPaise`, `suppliedAmountPaise` and everything counted from them are net.** The phone shows "Discount 5% off" under a line, the line at its net, and an "Order discount" row. Done: ✅ (read only).

## One product on several lines (2026-10-27)

Admin or the Accountant may now put the same product on more than one line of an order they add or edit, each at its own price or discount (for example 6 units at 10% off and 4 at 20% off). What changes for the phone:

- `GET /sales/orders[/:id]` may return an order whose `items` repeat a `productId`. **Show every line, and do not key or merge them by `productId`**; use the position in `items`. Quantities and amounts per product are the sum of its lines.
- The phone's own order is unchanged: `POST /sales/orders` and the `ORDER` sync record still take one line per product (a repeat is `400`, "A product appears twice"). The server prices the order, so the phone could not give a second price anyway.
- `POST /orders/:id/complete` (office only) takes an optional `line` (0-based position in `items`) per `supply` entry. It is required when the product is on more than one line; naming such a product without `line` is `400`.

## Invoices: Done is the office's (2026-10-27)

Marking a distributor order Done now needs the office's **invoice number**, so **the MR can no longer mark an order Done**:

- `POST /orders/:id/complete` is `ADMIN` / `ACCOUNTANT` only and takes `{ invoiceNumber, supply? }` (`invoiceNumber`: required, trimmed, up to 30 characters, unique). A used number is `409 INVOICE_NUMBER_TAKEN`. An MR calling it gets `403` (before this change the route let them in and a body-less call was a full supply).
- 📱 **Remove the Done button** from distributor orders in the field app. Cancel stays for the MR who placed a `PLACED` order. Sync is unchanged: it only ever placed orders (a phone-queued Done never existed).
- Order objects from `GET /sales/orders[/:id]` do not change shape for the phone; the web's orders report gains `invoiceNumber`. The phone may show the invoice number once the API returns it on the order (🔜, not yet on the phone's endpoints).
- From 2026-10-28 the office also types each delivered line's **batch number and expiry** when marking Done, and the product's **HSN/SAC** is frozen onto the line. Nothing changes for the phone: `GET /sales/orders` objects and sync are unchanged, and Done stays web-only.
- The invoice is frozen at Done: supplied lines + GST by the product's rate, rounded to the rupee. What a distributor owes for a Done order with an invoice is that total, not the supplied amount, so the web's dues move with GST. The phone's dues display, if any, must read the server's figures.
