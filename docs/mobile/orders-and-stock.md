# Mobile — Orders and the Monthly stock tab

What the field app must do for orders, and what to **remove**: the *Monthly stock* tab. The server is the authority. The phone app is another team's and cannot be changed from this repo, so this note is the contract. Decision: decision-log 2026-10-12 (orders, secondary, targets, services).

**Status key:** ✅ built on the server. 📱 the phone still has to do it.

## 1. Orders

| # | Rule | Status |
|---|---|---|
| 1 | An MR places an order for a **Chemist** or a **Distributor** on their Routes (`ORDER` sync kind / `POST /api/sales/orders`). The MR types the unit price; the server computes line amounts and the total. | ✅ |
| 2 | A **chemist order is information only.** It is recorded and shown, but never marked done or cancelled: `POST /orders/:id/complete` and `/cancel` on a chemist order return **`409 ORDER_INFO_ONLY`**. Hide Done / Cancel for chemist orders. | ✅ |
| 3 | A **distributor order** starts `PLACED` and must be marked **done** (or cancelled) by the MR who placed it, or by Admin. Only a **Done** distributor order is a primary sale. | ✅ |
| 4 | Done / Cancel is one-way: a second call returns `409 ORDER_NOT_PLACED` naming the state. | ✅ |

## 2. Remove the Monthly stock tab ✅

The *Monthly stock* tab (opening / closing counts per chemist and distributor) is **removed from the app**:

- Hide the tab and stop creating new `MONTHLY_STOCK` records. Stock for distributors is now an **Admin statement** on the web (opening + primary − secondary = closing), and an employee's secondary is entered on the web (or the phone's secondary screen, see [`secondary-and-targets.md`](secondary-and-targets.md)).
- The server still **accepts** `MONTHLY_STOCK` sync records, so a build that has not been updated yet does not break; they are no longer needed. Do not delete the sync kind from the app's queue code until every phone has updated.
- Chemist stock counts are not used in any figure.

## 3. Refs

[`LLD/sales-and-orders.md`](../LLD/sales-and-orders.md), [`LLD/sync.md`](../LLD/sync.md), sign-off E1, G1.
