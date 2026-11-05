# Beyond the Requirements

What we built or changed that is **not in the client's original documents** (`RULES BY GREYNOTE`
V1.0 and `TECH NOTES`, Drive folder "Greynote"). Section numbers like §4.5 refer to
`RULES BY GREYNOTE`. Dates and reasons are in [`decision-log.md`](decision-log.md).

**Why this list exists:** the rules doc says a major change to an approved workflow "may require
additional development time and additional charges", and TECH NOTES says "Don't add features
outside the approved scope". Everything below is either an addition or a deviation, so it should
be shown to the client and priced or accepted on purpose.

Items marked **(verify)** are from the docs' wording and not re-checked in code.

---

## A. Big shifts: they change how the system works

| # | Original requirement | What we built | Impact |
|---|---|---|---|
| A1 | §16.7–16.9: distributor payments and outstanding come from the Accounts software; Admin may enter a cheque by hand | Invoice number needed to mark an order Done, GST frozen on the order, payments recorded in the app and **allocated across invoices**, Invoices page, printable Tax Invoice | New accounting layer inside the app |
| A2 | §16.4: an order is submitted to a Manager/Admin | Placed → Done/Cancelled lifecycle. Only the office (Admin/Accountant) marks Done, and the MR can only cancel. The office can split a product across lines at different prices and add **discounts** (per line or whole order). **Part supply** and free units are set at Done | Orders become a sales-office process, not an MR submission |
| A3 | §14–15: Primary and Secondary are entered by field staff, with Opening/Closing stock | Primary is **derived** from Done orders plus an Admin adjustment. Secondary is the distributor's stock figure. There's a monthly distributor statement (opening + primary − secondary = closing), opening dues, and Chemists are excluded | Different data model and report logic |
| A4 | §20.1, 20.3: OTP login, max 1 device | Employee code + password. 2 devices for field staff, and **every** new phone, including the first, needs Admin approval. Admin can remove or log out a phone | Auth redesign |
| A5 | §4.4–4.6, 29.1: one Doctor to one MR, one Distributor to one employee | Shared coverage: many MRs per route and doctor, direct doctor assignment, **many routes and many people per distributor** | Assignment logic is many-to-many |
| A6 | §17 and TECH NOTES: Route/Area, Google Routes API distance, Google Maps SDK | Territory is **Zone → HQ → Route**. A route is HQ + destination + a **typed km**. Map and Google distance removed. Every field employee, managers included, covers Zones/HQs | Changed twice. Drops two paid-API dependencies |
| A7 | §21: Grade + CTC/Salary Structure, PF, ESIC | CTC built from pay components that follow the salary slip: EPF, ESI, **professional-tax slabs**, Basic %, per-employee customisation, grades with enforced CTC ranges, Absent days cost salary, HR adjusts a draft, Accountant finalizes and marks paid | Full payroll engine |
| A8 | §9: Other Expenses with Manager approval, kept out of salary | **Monthly expense statement**: one per month, submit and approval deadlines, an exception that must come before payment, a finalize step, and a month-run kept separate from payroll. Proof (receipts) on "Other" | Expenses are a month cycle, not per-item |
| A9 | §19: Employee → Immediate Manager → Admin for every item | Plans, Daily Plans and Services need **one approval** (manager *or* Admin). **HR can approve and reopen** plans. Admin and HR can edit an approved Monthly Plan. A manager can edit a waiting plan. DCR approval is a switch | Approval engine reshaped |
| A10 | §2.5: employee does not modify a submitted Daily Plan | Daily Plans **come from the approved Monthly Plan**. The employee can change the day's working type, work-with and doctors. A manager plans the day with the team | Planning model changed |
| A11 | §26: employee made Inactive | Deactivate with a last working day: team moved, work handed over, signed out at once, **reactivate (rehire)** | Offboarding workflow |
| A12 | §12–13: MR records Sample and Gift Distribution | **Admin allocates** samples and gifts to a doctor. The assigned MR draws against the allocation or marks the gift Done | Reversed direction |
| A13 | Targets not defined in the rules | Targets per MR per month and per product over month ranges, edited in place. A manager's target is the sum of their MRs. HR/Admin set them and managers only view | New performance model |

## B. Features nobody asked for

- **Inbox:** Admin messages to everyone, roles, Zones, HQs or named people, with **attachments** (PDF, images, Office files), no length limit, an unread count, and a Firebase push for each message.
- **Manager "Team" section on the phone:** Today, plans, leave calendar, orders and stock, and a person page.
- **Organisation tree and Team tab** on the employee page, plus **moving several employees to a new manager at once**.
- **Admin forgot-password** by emailed one-time code (Gmail SMTP). Any employee can change their own password.
- **Docs tab:** payslips and shared documents. A closed financial year blocks daily work.
- **Google Play compliance:** a public delete-my-account page, a demo Manager account, and rate limiting.
- **Attendance module** (absent days cost salary) and the full **Reports module**: Sales primary vs secondary, Stock, TA/DA, DCR, Salary, and the employee's own reports.
- **CSV downloads** everywhere, named after the person, designation and period.
- **Doctor extras:** profile photo, clinic name, phone, birthday and anniversary, a minimum gap between visits, "Not in plan" flags, and missed-call stages. **Visuals** are a standing per-doctor list (images only) with a full-screen viewer.
- **Employee extras:** profile photo, GHC001-style ids for everyone, ADMIN01-style Admin codes, EPF number, guided onboarding wizard with drafts.
- **Plan extras:** locked weekly offs and holidays on the Monthly Plan, out-station stay and transit days, holiday date ranges (e.g. Durga Puja) stored as one grouped entry.
- **Config registry:** every Admin-editable setting is defined in one registry.
- **Soft-delete exceptions:** TECH NOTES says "Don't hard delete business data". We added permanent delete **with an archive** for doctors, Zones/HQs/Routes, visuals, and an Admin-only hard delete for distributors.

## C. Not implemented yet

- ~~Managers cannot add doctors.~~ Now a setting: **Managers can add doctors** (`MANAGER_CAN_ADD_DOCTORS`, default off). Off, the API refuses a manager (anyone with a team) with 403; on, their doctor goes to their own manager or Admin for approval.
- **Emergency web DCR** (§10.5): field staff are kept off the web portal. **(verify)**
- **Admin applies leave on behalf of an employee** (§11.3). **(verify)**
- **Excel/PDF export** (TECH NOTES): only CSV exists.
- **Bounce cases:** Admin removing a bounced cheque amount (§16.9). **(verify)**
- **The buyer's FSSAI** is not stored, so the printed invoice omits it. HSN/SAC (product field), batch and expiry (typed per line at Mark Done) are printed from 2026-10-28.
- **Older Done orders** have no invoice numbers yet.
- **Over-allocation guard:** two payments recorded at the same instant could over-allocate one invoice.
- **Field app** (other team): remove the Done button, send clinic name and phone, cap frequency at 4.

## D. Rules the client left blank and we decided

These were left open in §31 and recorded in `client-sign-off.md` and the decision log. They aren't new features, but the client should confirm them.

- Missed-DCR rule: the account blocks after the grace period and **only Admin** can unblock.
- Doctor frequency is 1–4 (the example was 4 calls a month). The 8-day new-doctor wait was replaced by a minimum gap between visits.
- Leave is allocated per grade, with a probation switch at onboarding and an approval cutoff at the leave's first day.
- Leave requests go **directly to HR**, not through the manager chain.
- Stock is due on the 5th, and monthly stock is due on the month's last day.
- Salary is paid in the month the expense was paid.
- Money is stored as integer paise.
