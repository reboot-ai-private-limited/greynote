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
| 7.16 | Distributor page, Stock tab: pick a month | every active product; opening suggested from last month's closing (or the field count); orders shown; closing blank until a secondary is typed or a count exists | |
| 7.17 | Type a secondary and an adjustment of 5 with no reason, then Save | refused ("Say why"); with a reason it saves and the closing = opening + orders + 5 − secondary | |
| 7.18 | "Use field count" on a product with a count | opening and the derived secondary are filled in; Save keeps them | |
| 7.19 | Open the Sales report for that month | the row shows the statement's figures, "+5" adjustment and Source "Statement"; a field count that differs shows "Field count ≠ statement" | |
| 7.20 | Stock tab for a month whose previous month has a closing, and a field count with a different opening | the suggested opening is last month's closing | |
| 7.21 | Sales dashboard, open an employee; Set a target for All products, Oct–Dec, ₹3,00,000 | the target appears in "Targets"; with "This quarter" the Target tile shows ₹3,00,000 | |
| 7.22 | Enter a secondary of 40 for a product, Save | the Secondary tile = 40 × that product's PTR; achievement % = secondary ÷ target | |
| 7.23 | Change a product's primary total with no reason, Save | refused ("Say why"); with a reason it saves, and Primary = orders + the change at PTS | |
| 7.24 | Open the same employee as a manager above them, and as someone else | the manager can set targets and enter figures but not change primary; a stranger gets 403 | |
| 7.25 | Remove a target | it disappears; "Targets" and the totals update | |
| 7.20 | Stock tab in a past financial year, or for an inactive distributor | read-only | |
