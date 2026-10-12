# 4 · People

| Id | Do | Expect | Result |
|---|---|---|---|
| 4.00a | Employees → New employee: go through all eight steps | each Next saves a draft; a later step cannot be opened before the earlier ones are valid; Create gives a GRN id and password | |
| 4.00b | Address step: tick "Same as present" | the permanent fields lock and show the present address; untick lets you edit them | |
| 4.00c | Qualifications / Experience: add several rows, remove the middle one | the others keep their text; both steps can be skipped empty | |
| 4.00d | Work step: pick the top designation | no manager is asked for; any other designation needs one | |
| 4.00e | Save draft, leave, open it from the Drafts card | it reopens at the first step still missing, with everything filled in | |
| 4.00f | After Create: Copy and Share | the message holds name, id and password; Share only shows where the browser supports it; the password is not shown again | |
| 4.00g | Employees → Add office staff (Admin) | creates an HR, Accountant or Admin login; no field role offered | |
| 4.01 | Employees: open Promo Mr One | profile, manager, HQ, joining date | |
| 4.02a | Set CTC ₹1,44,000 with Basic 40% | Basic ₹57,600; the lines total ₹1,44,000; "Other allowance" is the rest | |
| 4.02b | Change FDA to 14% | FDA ₹8,064 (marked Edited); Other allowance drops by what FDA and EPF took; total still ₹1,44,000 | |
| 4.02c | Remove Medical, then Add a line → put it back; add a new line "Conveyance" ₹9,600 | the line leaves and returns; the new one appears; total unchanged | |
| 4.02d | Try to remove FDA (EPF is worked out from it), Basic or Other allowance | the remove button is off; Basic and Other allowance have no remove | |
| 4.02e | Add a ₹2 lakh fixed line to a ₹1.44 lakh CTC | a message says the lines add up to more than the CTC; Save is off | |
| 4.02f | Admin changes the org FDA %, then Pay components → re-apply | an employee with their own 14% keeps it; one without follows the new %; Conveyance stays | |
| 4.02 | Employee setup: set a CTC | monthly gross shown = CTC less employer contributions ÷ 12 | |
| 4.03 | CTC change that jumps more than `CTC_JUMP_WARN_PERCENT` | a typo warning, but it can be saved (K10) | |
| 4.04 | CTC change effective a past or future month | history keeps both revisions with effective months | |
| 4.05 | Employee with no joining date | the attendance calendar shows days as "unknown", never absent | |
| 4.06 | Leave & holidays: leave types, policies, holidays | listed; no half-day | |
| 4.06a | Onboard an employee with "On probation" ticked, then one without | only the first gets paid leave during probation (K6); the second is never on probation, however recently they joined | |
| 4.06b | Approve a leave whose first day has passed | refused (`LEAVE_APPROVAL_LATE`); rejecting works; an Admin exception lets it through once; a pending leave whose first day passed turns Rejected by itself (balance freed) | |
| 4.06c | Leave & holidays → Holidays → Upload list (Admin): download the template, fill 3 rows, choose the file | a preview lists each row as New; Import adds them; HR does not see the Upload button | |
| 4.06d | Upload a file with one unknown Zone and one bad date | nothing is added; both problems are listed with their line numbers | |
| 4.06e | Upload the same good file again | every row is "Already there"; Import is off | |
| 4.06f | Inbox messages (Admin, Daily work) → New message to one Zone | the sent list shows it with "0 of N" opened; as an employee of that Zone `GET /inbox` has it and the unread count is 1; an employee of another Zone has nothing | |
| 4.06g | As that employee mark it read; as Admin open the sent list | the unread count is 0 and the list shows "1 of N" | |
| 4.06h | Take the message back | it leaves the employee's inbox and count; the sent list shows "Taken back" | |
| 4.06i | Send with an expiry a minute ahead and wait | after it passes the message is gone from the list and the count | |
| 4.07 | Leave balances follow the financial year (K17) | a new year starts fresh | |
| 4.08 | Promotions → Promote an employee who has direct reports | cannot save until every report has a new manager or is marked "stay" (K14) | |
| 4.09 | Effective date | only the 1st of a month, next month or later (K13) | |
| 4.10 | Cancel a SCHEDULED promotion | cancelled; an applied one cannot be cancelled | |
| 4.11 | After the effective month starts (or "apply due" runs hourly) | grade, designation and managers change; history kept (K18) | |
| 4.12 | Requests already waiting at the promoted manager | stay with them (K16) | |
| 4.13 | Devices: pending device list | approve and reject work; HR and Accountant do not see it | |
