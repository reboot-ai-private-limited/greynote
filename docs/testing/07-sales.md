# 7 · Sales

| Id | Do | Expect | Result |
|---|---|---|---|
| 7.01 | Orders page (Admin) | orders to distributors with status Placed / Done / Cancelled; chemist orders shown as information (K23, K33) | |
| 7.02 | Mark an order Done / Cancelled | status changes; there is no "confirmation" step (K32) | |
| 7.03 | Open an order | lines, quantities, price, who raised it | |
| 7.04 | Filters by month and status | totals follow | |
| 7.05 | Stock: a distributor's monthly count | opening = last month's closing | |
| 7.06 | Primary value | only Done orders to distributors, in the month marked Done (K21, K31) | |
| 7.07 | Secondary | opening + primary − closing, valued at PTR (K22) | |
| 7.08 | Raise an order from the phone | **needs Step 6** | |
| 7.09 | Distributor page, Payments tab: Record payment (date, amount, mode, reference, note) | listed; Collected total and "Collected of ordered" update | |
| 7.10 | Cancel a payment, with a reason | stays listed, struck through, left out of the total; cancelling twice is refused | |
| 7.11 | Payment dated tomorrow, or in a closed financial year | refused | |
| 7.12 | Payments in a past financial year | Record payment is disabled | |
| 7.13 | Distributor page, Orders tab | that distributor's orders in the range, with who placed them | |
| 7.14 | Distributors list: Payment button on a row, save | modal opens for that distributor; stays on the list; "Collected this month" updates; disabled for an inactive distributor and in a past financial year | |
| 7.15 | Distributors list: Edit and Deactivate in the row | Edit opens the distributor; Deactivate asks to confirm and the button becomes Reactivate | |
