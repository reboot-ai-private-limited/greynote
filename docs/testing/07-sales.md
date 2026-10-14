# 7 · Sales

| Id | Do | Expect | Result |
|---|---|---|---|
| 7.01 | Orders page (Admin) | orders to distributors with status Placed / Done / Cancelled; chemist orders shown as information (K23, K33) | |
| 7.02 | Mark an order Done / Cancelled | status changes; there is no "confirmation" step (K32) | |
| 7.03 | Open an order | lines, quantities, price, who raised it | |
| 7.04 | Filters by month and status | totals follow | |
| 7.05 | Stock: a distributor's monthly count | opening = last month's closing | |
| 7.06 | Primary value | only Done orders to distributors, in the month marked Done (K21, K31) | |
| 7.07 | Secondary | opening + primary − closing, valued at PTS (K22, changed 2026-10-14) | |
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
| 7.22 | Enter a secondary of 40 for a product, Save | the Secondary tile = 40 × that product's PTS; achievement % = secondary ÷ target | |
| 7.23 | Change a product's primary total with no reason, Save | refused ("Say why"); with a reason it saves, and Primary = orders + the change at PTS | |
| 7.24 | Open the same employee as a manager above them, and as someone else | the manager can set targets and enter figures but not change primary; a stranger gets 403 | |
| 7.25 | Remove a target | it disappears; "Targets" and the totals update | |
| 7.20 | Stock tab in a past financial year, or for an inactive distributor | read-only | |

## Visuals shown to doctors (2026-10-10)

| # | Step | Expect | Result |
|---|---|---|---|
| 7.30 | As Admin open **Visuals**, upload a PNG for a product and a PDF with no product | both appear, Active; the PDF shows "General" | |
| 7.31 | Edit the PNG's title and move it to General; deactivate the PDF | the list updates; the filters (product, General, status) narrow it | |
| 7.32 | As an MR, Visuals → choose one of your doctors, tick two, Submit | "2 visuals added"; both now show ticked and locked | |
| 7.33 | Tap a locked visual | nothing changes; the MR cannot untick it | |
| 7.34 | Tick a third, Submit; then tap Show | the doctor's three visuals open one after another (pictures in the app, the PDF in the viewer) | |
| 7.35 | As Admin open that doctor → **Visuals** tab | three rows, each with who added it and when | |
| 7.36 | Remove one as Admin | it leaves the list; the MR sees it unticked and can add it again | |
| 7.37 | Call remove as the MR (API) | 403 | |
| 7.38 | As the MR's manager, GET the doctor's visuals and DELETE one | both work; as an unrelated manager, 403 | |
| 7.39 | Deactivate a picked visual in the library | it disappears from the MR's list; Admin's tab shows it Inactive | |

## Office orders, Accountant access, PTS (2026-10-14)

| # | Step | Expect | Result |
|---|---|---|---|
| 7.40 | As Accountant, Orders → Add order: employee, a distributor, one product with qty and price, Save | the order appears as Placed, credited to that employee; the price starts at the product's PTS | |
| 7.41 | Add order for **a chemist** | allowed; the order is information only (no Done / Cancel); the price starts at PTR | |
| 7.42 | Add order: pick a distributor, then switch to Chemist | the outlet is cleared; an order never carries both | |
| 7.43 | Open a Placed order → Change order: edit a qty and price, add a line, Save | lines and total follow; employee, outlet and date are unchanged; then Mark Done works | |
| 7.44 | Open a Done or Cancelled order | no Change button; a direct PATCH is `409 ORDER_NOT_PLACED` | |
| 7.45 | Two people: one marks Done while the other has the change dialog open, then Save | the change is refused with 409, nothing is overwritten | |
| 7.46 | As Accountant, Distributors → Add distributor (route, people pickers) | the wizard works end to end; the route and employee pickers list names only | |
| 7.47 | As Accountant open Sales dashboard and an employee | dashboard and report load; **no** "Enter the month's figures" box; targets cannot be set | |
| 7.48 | Employee report, "By distributor" | one row per distributor with Done orders in the range; the rows add up to the order part of Primary | |
| 7.49 | As Accountant, Payroll → "Salary paid" | one row per month with the total and the number paid; no names | |
| 7.50 | Secondary 40 of a product with PTS ₹80 and PTR ₹100 | Secondary tile = ₹3,200 (PTS), not ₹4,000 | |
| 7.51 | Set a product target as 50 units | the amount = 50 × PTS | |
