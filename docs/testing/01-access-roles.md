# 1 · Access and roles

| Id | Do | Expect | Result |
|---|---|---|---|
| 1.01 | Log in as Admin with a wrong password | refused with a clear message; no hint which part was wrong | |
| 1.02 | Log in as Admin correctly | lands on Dashboard; name and role top right | |
| 1.03 | Reload the page | still signed in | |
| 1.04 | Sign out from the top-right menu | back at login; Back button does not show panel pages | |
| 1.05 | Employees → Add: create an HR user and an Accountant user | both appear in the list; note their codes in test-data.md | |
| 1.06 | Log in as HR on a new device | held as pending until Admin approves it under **Devices** (if the device rule applies to the web) — note what happens | |
| 1.07 | Side menu as **Admin** | Home (always open); HR, Sales & Distribution, Payouts, Reports, Master data, System collapsible | |
| 1.08 | Side menu as **HR** | Home (Dashboard, Approvals), HR, and Master data > Pay structure only; no Sales & Distribution, Payouts or Reports | |
| 1.09 | Side menu as **Accountant** | Home: Dashboard only; HR: Attendance only; Payouts: Payroll, Expenses, Expense payouts; Master data: Doctor services (until Step 0b), Pay grades, Pay components (read) | |
| 1.09a | Sign in on the web as a **field employee** | refused: "The web portal is for office staff. Please use the mobile app."; phone app sign-in still works | |
| 1.09b | Type an Admin-only address as HR / Accountant (e.g. `/settings`) | "You do not have access to this page" inside the portal, not an API error | |
| 1.10 | As HR / Accountant, type an Admin-only address (e.g. `/reports/sales`, `/orders`, `/zones`) | refused or redirected, never shows data | |
| 1.11 | Collapse and expand groups; reload | the choice is remembered; the group with the current screen opens by itself | |
| 1.12 | Approvals badge (Admin) | shows the number waiting; matches the Approvals page | |
| 1.13 | Hover the collapsed rail; resize to phone width | rail expands on hover; drawer opens from the menu button | |

The full role-by-route table is checked by the automated test; this area checks what a person sees.
