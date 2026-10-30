# 4 · People

| Id | Do | Expect | Result |
|---|---|---|---|
| 4.00a | Employees → New employee: go through all eight steps | each Next saves a draft; a later step cannot be opened before the earlier ones are valid; Create gives a GHC id (GHC001, GHC002 …) and password | |
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
| 4.02 | Employee setup: set a CTC | total earnings = the CTC ("Total earnings = CTC ✓"); deductions (EPF, ESI, professional tax) and take-home shown; a CTC under ₹10,000 a month is refused; Basic accepts up to 100% or a monthly amount | |
| 4.03 | CTC change that jumps more than `CTC_JUMP_WARN_PERCENT` | a typo warning, but it can be saved (K10) | |
| 4.04 | CTC change effective a past or future month | history keeps both revisions with effective months | |
| 4.05 | Employee with no joining date | the attendance calendar shows days as "unknown", never absent | |
| 4.06 | Leave & holidays: leave types, policies, holidays | listed; no half-day | |
| 4.06a | Onboard an employee with "On probation" ticked, then one without | only the first gets paid leave during probation (K6); the second is never on probation, however recently they joined | |
| 4.06b | Approve a leave whose first day has passed | refused (`LEAVE_APPROVAL_LATE`); rejecting works; an Admin exception lets it through once; a pending leave whose first day passed turns Rejected by itself (balance freed) | |
| 4.06c | Leave & holidays → Holidays → Upload list (Admin or HR): download the template, fill 3 rows, choose the file | a preview lists each row as New; Import adds them | |
| 4.06d | Holidays (HR): Edit a one-day holiday (change name and date); Edit a range (extend it by a day) | one-day replaced by the new one; the range is replaced whole (every day) with the new span; a Zone holiday with no zone is refused and the old one stays | |
| 4.06d | Upload a file with one unknown Zone and one bad date | nothing is added; both problems are listed with their line numbers | |
| 4.06g | Settings → Weekly days off → Change the days off from a date: pick next month's 1st, add Saturday with 1st and 3rd, save (confirm the warning) | the Holidays list shows the 1st and 3rd Saturdays from that date as "Weekly off" rows; the 2nd and 4th are working days; dates before it are unchanged | |
| 4.06h | Try to start a new set in the past, and to edit or remove a set that has started | refused with a message; nothing changes | |
| 4.06i | Request a leave across a 3rd Saturday | the Saturday is not counted; a leave on only that Saturday is refused ("all days off or holidays") | |
| 4.06j | Save a Monthly Plan entry on a 1st Saturday; look at the attendance calendar for that month | the plan is refused as a weekly off; attendance shows Weekly off, not Absent | |
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
| 4.14 | Employees → New employee, Personal step: add a photo, choose another, remove it | preview shows at once; the old file is gone from Cloudinary after each change; a PDF or a file over 5 MB is refused with a message | |
| 4.15 | Leave the wizard after adding a photo, then Continue the draft | the photo is still there; Create keeps it on the new employee | |
| 4.16 | Employee page and Employees list | photo shows (initials when none); Choose another / Remove work; deleting a draft removes its photo from Cloudinary | |
| 4.17 | New employee ids | after `migrate:employee-codes --apply`, everyone except Admins is GHC###, oldest joiner first; the next new employee, field or office staff, gets the next number. Admins are ADMIN01, ADMIN02 … (`migrate:admin-codes --apply`) and a new Admin gets the next ADMIN number | |

## Reporting managers and coverage (2026-10-15)

| # | Do | Expect | Pass |
|---|---|---|---|
| 4.30 | Profile of an ASM/RSM (Admin or HR) → Coverage → Edit: tick several HQs, Save | saved; the card lists those HQs | |
| 4.31 | Same for a ZSM | Zones are offered instead of HQs | |
| 4.31a | MR → Territory → Edit: add an HQ | its routes appear ticked in a Zone > HQ list; tick/untick a Zone, an HQ, or "Select all"; Save | Routes card lists exactly the ticked ones |
| 4.31b | Routes card → Remove (or Edit routes → untick) one route | it goes from the card and from that route's Assigned card; no "not assigned" error | |
| 4.31c | Territory → remove an HQ, Save | that HQ's routes are taken off the employee | |
| 4.32 | New employee (MR) in HQ A: Work step, Choose manager | only ASM/RSM/ZSM/NSM covering HQ A (by HQ or Zone), each as "Name (ASM)"; an ASM covering only HQ B is absent; one with no coverage shows "no coverage set" | |
| 4.33 | Create an RSM with no manager when no ZSM exists | saved and active | |
| 4.34 | Change the designation or HQ after choosing a manager | the manager is cleared | |
| 4.35 | Via API set an MR's manager to another MR | refused with a message naming the designations | |
| 4.36 | An employee with no manager submits a Daily Plan | it appears for Admin to approve in one step | |
