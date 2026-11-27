# Decision Log

Decisions that have been **made**, newest first, with what they replaced and what they cost.

Three files cover decisions and they do not overlap:

| File | Answers |
|---|---|
| [`erd/`](erd/README.md) / [`hld/`](hld/README.md) | **The design as written** — schema and mechanism, in the present tense |
| [`engineering/tech-choices.md`](engineering/tech-choices.md) | **Current state**: what we use and why |
| this file | **History**: when it changed, what it replaced, what was rejected |

When something here supersedes an ERD/HLD doc or `tech-choices.md`, that doc gets rewritten to
describe the new present and this log keeps the record of the change. This log is append-only —
entries are never edited to match a later reversal; a reversal is a new entry that references the
old one.

---

## 2026-11-23 — A manager can call on, and sees in the phone's list, the chemists their team holds

- **Decision:** the sync snapshot's `chemists` is the caller's own plus, for a manager, those held by anyone below them (own first; capped at 2,000 so a ZSM/NSM cache stays small). `CallChecks.chemist` accepts a call (and follow-up) on a chemist when the caller is assigned to it or is above any holder, the rule doctors already use. An MR's list and checks are unchanged. Shape unchanged, so no phone change.
- **Why:** a manager has no chemists assigned to them (since 2026-11-16 a chemist is held by assignment), so the Chemist Call dropdown was empty for every manager.
- **Replaced:** "the snapshot's chemists is only the ones assigned to me" (`team-visibility.md` §2, `chemists.md` §3a).
- **Rejected:** sending only the chemists on the manager's plan routes (needs a planning dependency and goes stale when the plan changes); changing the phone to read `/chemists/team` (the phone is not being changed for this).
- **Cost:** a manager's snapshot grows with the team's chemists, up to the cap.

## 2026-11-04 — A distributor shows to an employee only when assigned

- **Decision:** the phone's distributor list, orders and stock now use `assignedUserIds` alone. Before, a distributor whose Zone, HQ or Route met the employee's also showed, so an employee could order from one that never counted toward their target (achievement already used assignment only). Coverage stays on the distributor as admin information. The employee page (Profile tab, Admin) gains a read-only **Assigned** card: distributors, doctors, and chemists via routes.
- **Migration:** `pnpm --filter @greynote/api migrate:coverage-assignments` (dry run by default) assigns each active distributor to the employees it used to reach by coverage, so nobody loses access on the day. Admin then trims the lists.
- **Distributor counts need approval (behind the switch `STOCK_COUNT_APPROVAL`, default off, 2026-11-04):** an employee's own count is a draft until they submit the month; the manager (Admin if none) approves it; only approved counts feed achievement and reports. The Secondary Sales screen is one entry tab (the count) plus a read-only **My record** of total secondary per product; the per-product entry and its approval are retired. On approval the rows record who they count toward (the counter plus the distributor's assignees at that moment), which also fixes the old problem of an unassign moving past months. Admin can delete an employee's month of counts from the approval page. The phone work is documented in `docs/mobile/secondary-and-targets.md`; the field app is another team's.
- **Not done:** assignment history with dates. Unassigning a distributor still removes its past months from that employee's achievement; Admin can still save the distributor's statement. Chosen as not needed.

---

## 2026-11-03 — Chemists get an optional phone number

- **Decision:** a chemist can carry a phone number (10–15 digits, optional leading `+`), the same rule as a doctor's. Optional, because every existing chemist has none and an older phone build does not send it. Admin sets it on the web (create and edit); an employee can send it when adding a chemist (`POST /chemists/added`, the `NEW_CHEMIST` record, and the `PUT` resubmit); the snapshot's `chemists` carry it and the approval preview shows it.
- **Not done:** the approver editing a pending chemist's details (doctors can); making the number required. The phone app is another team's: the contract is in `docs/mobile/chemists.md`.

---

## 2026-11-02 — A day of pay is the month's own length, and HR edits a draft's salary in one place

- **Decision:** unpaid leave and absent days are priced `base ÷ days in that month` (October ÷31, November ÷30, February ÷28 or ÷29), not a flat ÷30. The divisor is stored on each run as `payDays`, so every run generated before this reads `payDays = 30` and keeps its numbers; regenerating a *draft* uses the new basis. The slip's Total Working Days is `payDays` and Days Attended is `payDays − unpaid − absent` (October slip: 31, not 30). Leave and absent together are still capped at the whole month (`payDays`).
- **Supersedes:** the flat-÷30 rule (HLD 7, LLD payroll, decision-log 2026-09-30 and later "`DEDUCTION_DAYS = 30` is unchanged" notes). A full month unpaid still deducts exactly the base. Cost: a day is worth slightly less in a 31-day month and more in February; no company setting (Keka offers 30-or-actual; we chose calendar always).
- **Draft editing (HR/Admin, unchanged roles):** one *Edit salary* dialog replaces the two earlier ones. (1) *Change a day* by date to Present, Paid leave, Unpaid leave, Half day or Absent: payroll-only, the leave balance and attendance are not touched, and the slip's Absent / Unpaid / Attended counts follow. (2) *Add money* under a name (Bonus, Incentive, Arrears, Allowance, other). (3) *Cut money* under a name (Penalty, Advance recovery, other) by days (halves, priced ÷ `payDays`) or in rupees. Each is an append-only adjustment with a reason; named amounts are their own slip lines, day changes one line "Days changed by HR"; entries from before this date still show as "Adjustment".
- **Not done:** creating a real leave record from payroll (a possible follow-up); overriding the base salary itself.

---

## 2026-10-28 — The weekly off is a schedule of rules (every Sunday, 1st and 3rd Saturday…), each starting on a date

- **Decision:** the single setting `WEEKLY_OFF_DAY` is replaced by `WEEKLY_OFF_SCHEDULE`: a list of rule sets, each with an `effectiveFrom` date. A rule is a weekday that is off every week (`ALL`) or only in some occurrences (`weeks: [1, 3]`; the 1st Saturday is the Saturday on day 1–7 of the month). The rules in force on a date are those of the latest set that has started. Example: Sunday every week from the start, plus the 1st and 3rd Saturday from 1 Nov 2026.
- **Why not holiday rows:** a Holiday row per 1st/3rd Saturday means regenerating them every year and deleting and recreating them whenever the pattern changes. A rule is edited once.
- **Why a start date:** attendance, payroll and plan locks are read live from the setting. Without a start date, changing 1st/3rd to 2nd/4th would recolour past months. A set that has started cannot be edited or removed, and a new set cannot start in the past (the `PATCH /config/WEEKLY_OFF_SCHEDULE` check; leaves already counted keep their stored days as before).
- **Where it shows:** the Leave & holidays → Holidays list shows the partial days ("1st Saturday") as read-only *Weekly off* rows from `GET /hr/weekly-offs?from&to` (every-week Sundays only if ticked). Leave counting, `listOffDates`, plan locks, attendance (`WEEKLY_OFF`), payroll, reminders and reports all go through HR's calendar, so they follow with no change of their own. `DEDUCTION_DAYS = 30` is unchanged.
- **Phone:** the sync snapshot keeps `weeklyOffDay` (the day that is off every week today, `SUNDAY` if none) and adds `weeklyOffSchedule`. The server already sends `planOffDays`, so plan locking is right on an old app; only the Holidays screen's "Weekly off: every Sunday" line is out of date (`mobile/field-app-gaps.md` B7). The app is another team's.
- **Migration:** `migrate:weekly-off-schedule` carries a company's old `WEEKLY_OFF_DAY` over (re-run the seed first; `docs/manual_deploy.md`). A company on Sunday needs nothing. The old key is no longer read.
- **Not changed:** one schedule for the whole company; a weekly off per employee or per HQ is not supported. Holidays still win over a weekly off on the same day.

## 2026-10-26 — Every employee can change their own password (signed in, current password asked)

- **Decision:** `POST /identity/auth/change-password {currentPassword, newPassword}` for any signed-in role. A wrong current password is `403`, a new password equal to the current one is `400`, five wrong tries in 15 minutes per user is `429`. The other sessions end (`PASSWORD_RESET`); the one making the request stays, found by its refresh token (the web cookie, or the body on the phone, as in logout). With no recognisable refresh token every session ends.
- **Not changed:** Admin still resets *other* people's passwords (A5). A forgotten password is still Admin-assisted (an Admin uses the emailed-code flow); no email or SMS for employees.
- **Web:** *My account* (`/account`, top-bar menu) with Current / New / Confirm and an eye toggle on each. **Phone:** `mobile/account.md`; the app is another team's.
- **Why:** until now an employee could not change a password an Admin had typed for them.

## 2026-10-23 — One approval for Monthly Plans, Daily Plans and Services

- **Decision:** `MONTHLY_PLAN`, `DAILY_PLAN` and `DOCTOR_SERVICE` are registered `managerOnly`. The manager approves, or Admin does in their place, whoever acts first, and the request is `APPROVED`. It replaces manager, then Admin.
- **Not changed:** Leave stays manager, then HR or Admin. The DCR is decided by the Admin setting *Daily reports need approval* (`DCR_APPROVAL_REQUIRED`), not by this change. The field app is another team's; only `docs/mobile/` was updated.
- **Rollout:** the workflow is snapshotted at submit, so only new and resubmitted requests change. `pnpm --filter @greynote/api migrate:single-approval -- --apply` moves requests waiting at `MANAGER_APPROVED` to `APPROVED` (dry run by default). It also switches requests still at `SUBMITTED` to the one-approval workflow, since a request keeps the workflow it was submitted under. Nothing else needs to run: the gate and the monthly-plan inheritance already treated both statuses as approved.
- **Web:** a waiting one-approval request reads "Waiting on the manager or Admin".
- **Still without approval (follow-ups, not decided):** payroll finalize and pay, HR/Admin edits to expense rows after approval, manager changes to MR targets and doctor visit frequency, doctor delete and assignment, holiday edits, manager changes and CTC. Late-grant and device approvals are decided outside the Approvals page.

## 2026-10-14 — Basic 100% means Basic only; a CTC under the first PTax slab is allowed

**Decision:**
- **Basic = 100% of the CTC (or a monthly Basic of CTC ÷ 12) is the exception:** no other earning, no EPF, no ESI. Only the mandatory professional tax comes off. ₹100 a month with ₹10 PTax is ₹90 in the bank. Derived from the inputs (`isBasicOnly`, `ctcBreakdown.ts`), nothing new stored. Added lines, rule changes and typed amounts are refused in this mode rather than dropped silently.
- **Professional tax stays the `PTAX_SLABS` system setting, measured on the monthly gross** (₹10,000–14,999 → ₹110, ₹15,000–19,999 → ₹130, ₹20,000 and above → ₹150). **A gross below the first slab pays no PTax**; it is no longer refused.
- **Assign / revise screen:** CTC and Basic are the inputs and the breakdown is shown read-only. "Customise components" opens editing, with a visible × to remove a line and chips to restore a removed one. Basic 100% shows a one-line explanation and the net in the bank instead.

**Assumed (confirm with the client):** Basic 100% also drops EPF and ESI even when the employee has an EPF/ESI number.

**Open:** browser check; the Pay components screen has no sample-CTC preview yet.


## 2026-10-13 — Google Play: delete-my-account, and a demo Manager for the reviewers

**Decided:** Play needs an in-app way to delete the account and working reviewer logins. **Deletion** (FIELD only) scrubs the person and keeps the records: name becomes "Deleted user", email, phone, personal details, bank details and uploaded documents (files removed from storage) go, the password is replaced, the account is made inactive, every session ends and phones are unregistered; `deletedAt` is stamped. Payroll, calls, DCRs, expenses and approvals stay under the employee code, as do designation, pay band, manager, HQ and joining date. `POST /identity/auth/delete-account {password}` (the person, password asked again) and `POST /identity/users/:id/anonymise` (Admin/HR, on a written request). A manager with active reports is refused (`HAS_ACTIVE_REPORTS`) until the team is moved. **Demo:** `seed:demo-manager` creates DEMOMGR (ASM) with DEMOMR1/2/3, a demo zone/HQ/route and six doctors; users carry `isDemo`: login skips device approval for them, payroll, attendance and the daily jobs leave them out (`listActiveIdsByRole`). **Demo accounts can be deleted** (Play's reviewers must test deletion): DEMOMR1 is the reviewer's login, DEMOMR2 is kept for our internal testing, DEMOMR3 is the one the reviewer deletes. The seed tops up missing demo users without touching existing passwords, so a deleted one is restored by `--remove` and a re-seed with the same password. The password comes from `DEMO_MANAGER_PASSWORD` and is never stored in the repo.

**Why:** statutory (payroll) and audit records must outlive the account; Play accepts retention that the privacy policy discloses. A POST rather than DELETE-with-body, which some phone HTTP clients drop.

**Cost:** ADMIN/HR/ACCOUNTANT accounts are not self-deletable (an Admin deactivates them; this also protects the last Admin). The demo has no calls, DCRs, leave or expenses yet, so the Team screens for those show empty. Play may also want a public web page for deletion requests; not built (decided in-app only). The privacy policy must say what is kept and why.

**Rejected:** hard delete (breaks payroll and manager reports); a request-only route (slow, and Play expects it in the app).

**Refs:** [`mobile/account.md`](mobile/account.md), `LLD/identity.md`.

---

## 2026-10-12 — Docs tab: payslips, shared documents; a closed year blocks daily work

**Decided (owner's brief):** the phone's Docs tab shows the employee's own **payslips**, bounded by the financial year (older ones by switching year on the Financial Year screen), and **other documents the Admin adds**. A **closed** financial year turns the phone's daily work read-only, with a notice. The phone docs also say how to read back a past day's report, secondary sales, orders, monthly expense approval, leave and service requests.

**Built:** `GET /payroll/me` (FIELD): finalized runs only, for the year in view; the slip logic moved to `packages/contracts` (`payslipOf`) so one calculation serves the portal and the phone (nothing stored, no PDF). New `documents` module: Admin uploads a PDF/JPG/PNG (≤ 10 MB) for everyone or named employees; employees list theirs; web Documents page. `assertFinancialYearOpen` extended to the daily-report gate, plan deadlines, orders and leave; `/config/public` returns `closedFinancialYears`.

**Why:** drawing the slip from the run keeps one source of truth, as the web slip already does. Documents are their own module because Identity's per-user onboarding documents are HR's, not a library. Viewing a past year was already read-only on the server; "closed" is the Admin's lock after the last payout.

**Cost:** a year can only be closed once it has ended, so today's work is never refused: the guard bites late and back-dated records and past-month plans and leave. Approving a leave dated in a closed year is now refused too. No per-document edit (remove and add). Phone screens are another team's job: [`mobile/docs.md`](mobile/docs.md), [`mobile/reports.md`](mobile/reports.md), [`mobile/leave-report.md`](mobile/leave-report.md), [`mobile/service-requests.md`](mobile/service-requests.md).

**Rejected:** a stored payslip PDF (a second copy to keep right); a "closed" flag per employee (the year is the unit).

---

## 2026-11-02 — Doctor search in the service request form (docs only)

**Decision:** the phone's service request form gets a searchable doctor dropdown, fed by `doctors/mine` (MR) and `doctors/team` (manager) with `search`, `page`, `pageSize`. [`mobile/service-requests.md`](mobile/service-requests.md) §2 and §3 spell it out.

**Why:** a manager's picker holds the whole team's doctors, too long to scroll. **Cost:** none on the server, since both lists already take `search`; the phone (another team's) builds it.

---

## 2026-11-02 — Work With is the caller's own tree; chemist calls have no Work With

**Decision:**
- **`GET /identity/work-with`** returns the caller's **upline** (every manager above) and **downline** (everyone below, any depth), active only. The `scope` parameter is gone. The admin/HR/accountant `/work-with/directory` is unchanged.
- **Plan save enforces it:** a daily or monthly plan's `workWith` must be inside that set, for every employee (before, managers had a downline-only check and others only an active check).
- **Chemist calls drop `workWith`** (payload, API, stored record, web card and CSV). Doctor calls keep it. Old phone builds that send it are ignored.

**Why:** an employee should pick colleagues from their own line, not the whole organisation; a chemist visit is not a joint-work record.

**Cost:** the phone (another team's) must remove the Managers/All switch and the chemist Work With field; both are in [`mobile/monthlyplan.md`](mobile/monthlyplan.md) §5 and [`mobile/dcr.md`](mobile/dcr.md). Old stored chemist `workWith` values stay in the database, unread.

**Supersedes:** the 2026-10-12 "every manager in the org" rule below.

---

## 2026-10-26 — Plan reads name the colleagues in Work With

**Decision:** plan days keep `workWith: string[]` (ids) and gain a read-only sibling `workWithPeople: [{ id, name, designation, label }]` on `GET /planning/daily/:id`, `GET /planning/monthly/:id` (entries and amendment `previous`), `GET /team/plans` and the sync planning snapshot. `label` is `Name (Designation)`, built in Identity (`namePeople`) with the same format as `/identity/work-with`.

**Why:** the phone's request-summary screen prints `"N colleagues"` from `workWith.length`, so approvers cannot see who the day is spent with. The phone is another team's, and it, the sync cache and the save/amend flows all depend on ids, so `workWith` cannot change shape.

**Cost:** the phone still shows the count until that team prints `workWithPeople[].label` ([`mobile/monthlyplan.md`](mobile/monthlyplan.md) section 5). The designation is the current one, not a snapshot.

**Rejected:** turning `workWith` into labels (breaks saves and offline sync); naming people on list reads (cost on every list, and no screen needs it).

---

## 2026-10-12 — Work With lists every manager in the org; monthly plan rules re-verified

**Decision:**
- **`GET /identity/work-with`** (FIELD) replaces the idea of a per-relation "colleagues" list for the Work With picker: by default **every active manager in the organisation** (anyone with direct reports, not just the caller's chain); `?scope=all` gives every active field employee. Each row has a `label` — `Name (ASM)` — and reports print people that way.
- The phone app is another team's; it calls `GET /identity/colleagues`, which the API has never had (team targets and the orders team view depend on it). Not changed here.
- **No approved Monthly Plan, no work that month.** A Daily Plan can't be saved or submitted for a day in a month whose Monthly Plan isn't past the manager (409 `MONTHLY_PLAN_NOT_APPROVED`), and the logging gate (calls, DCR submit, expenses) refuses with the same code, ahead of the daily check. Unconditional — no setting; current data is test data. A new joiner or someone who missed the deadline gets a late-submission exception for the month.
- **Admin picks the exact end of a late-submission exception** (`expiresAt`), in the future and within the new `LATE_PLAN_GRANT_MAX_HOURS` (744). Left out, `LATE_PLAN_GRANT_VALID_HOURS` still applies. Web: **Late submissions** (Admin) — grant with a date and time in the business timezone, list, revoke.
- **Work With in the web previews prints `Name (ASM)`** from the person's current designation. Keeping the designation as it was on the day (a snapshot on every plan day and call) was considered and not done; a promotion therefore changes how old days read.
- Verified as already correct: the Monthly Plan deadline is the end of the business day of the cutoff day in the previous month, so it follows `DAY_START_TIME` (02:00 → 01:59:59.999 next morning).

**Cost:** an employee whose month isn't approved is stopped from planning and logging until it is, or Admin grants an exception. The designation shown for old days can change after a promotion.

**Mobile rules:** [`mobile/monthlyplan.md`](mobile/monthlyplan.md).

---

## 2026-10-12 — Monthly expenses: submit and approval deadlines, with an exception that must come before payment

**Decision:**
- **Two deadlines from System settings**, each the end of a business day of the month *after* the expenses: the employee must **send** the month by `EXPENSE_SUBMIT_CUTOFF_DAY` (default the 7th) and the manager or Admin must **approve** it by `EXPENSE_APPROVAL_CUTOFF_DAY` (default the 10th, never earlier than the submit day). Past the first, submit is a 409 `EXPENSE_SUBMIT_LATE`; past the second, approving is a 409 `EXPENSE_APPROVAL_LATE` (and rolls back). Rejecting is never blocked.
- **A one-off exception lifts either deadline** (same shape as the late Plan exception, B8): per employee, month and phase (`SUBMIT` / `APPROVE`), a reason, an end time (default `LATE_EXPENSE_GRANT_VALID_HOURS` 24, at most `LATE_EXPENSE_GRANT_MAX_HOURS` 168), used once with the send or approval. **Admin** can always grant; a **manager** only for their team and only while `LATE_EXPENSE_GRANT_BY_MANAGER` is on.
- **It has to come before the money.** Once any row of the month is `PAID`, an exception cannot be granted and the month cannot be reopened (409 `EXPENSE_MONTH_PAID`).
- **No exception, no month:** a missed month is not rolled into the next; only an exception revives it.
- **Unchanged:** TA/DA stays automatic and arrives in the statement with the employee's Other entries; Other entries may be dated any past day while the month is still open.

**Cost:** a separate `ExpenseMonthGrant` record (not the Plan grant), because the Plan grant is tied to the planning module's `PlanKind`. Endpoints `POST/GET /api/field-activity/expense-grants`, `POST …/:id/revoke`. Seed the five new settings before deploy (an unseeded database falls back to 7 / 10 / off / 24 / 168). A month already submitted before deploy and approved after its approval day needs an exception.

---

## 2026-10-10 — Monthly expenses: one statement per month, approved by the manager or Admin, then paid

**Decision:**
- **Expenses leave the DCR.** An employee no longer enters Travel / Meal / Misc on the day's report. They add **dated entries in one "Other" category** (`Expense.type = OTHER`, no DCR behind it) on the new **Expenses** screen, online.
- **The month is the unit.** A statement shows, per date, **TA and DA** (the server's `AUTO` rows, from approved DCRs) plus the employee's **Other**, and the totals. Previous months stay on the screen with whether each was approved.
- **Submit and approval only from the 1st of the next month** (409 `MONTH_NOT_ENDED` before). A month cannot be sent empty, and its Other entries lock once sent.
- **One stage:** approval kind `EXPENSE_MONTH` is **manager-only** — the nearest manager decides, **Admin can also approve or reject** (override, or top of chain when there is no manager). Rejecting or reopening gives the month back to the employee.
- **Approval makes the month payable.** An expense is paid only if its DCR was accepted (`accepted`) **and** its month statement is approved (`monthApproved`). Mark-paid, the payout sheet and pay-all all require both. The 15th payout day and the FY-close guard are unchanged.
- **If TA/DA changes after the send** (a late DCR approval), the statement shows the total that was sent beside the live one; Admin reopens the month to send it again.

**Replaces:** manual Travel/Meal/Misc entered per DCR and accepted with it (decision-log 2026-09-23). Old rows stay readable and count as Other; the `EXPENSE` sync kind still works for phones that have queued one, but the screen no longer creates them.

**Cost:** `pnpm migrate:expense-months -- --before YYYY-MM --apply` flags rows before the cutover month as `monthApproved` so past unpaid expenses stay payable (dry run first; not run). Web has no employee screen (field employees use the phone); the portal gets only the approval preview.

---

## 2026-10-10 — Proof (receipts) on an "Other" expense

**Decision:**
- An "Other" expense can carry **up to 3 proof files** of 5 MB each — PDF, JPG or PNG (read from the file's own bytes, as for leave proof). Proof is **optional**.
- The phone first creates the expense (`POST /field-activity/expenses/other`, unchanged JSON), then uploads each file: `POST /field-activity/expenses/other/:id/attachments` (multipart field `file`) and `DELETE …/attachments/:attachmentId`. Only the owner, and only while the month is still editable (not sent for approval, or sent back) and the row unpaid.
- Files are stored in Cloudinary under `greynote/users/{userId}/expense-proof/{expenseId}`. Deleting the expense deletes its files. The statement's `others[]` lines, and the Accountant's expense list, return each file as `{ id, url, fileName, mimeType, sizeBytes, uploadedAt }` — never the storage id.

**Why:** the manager, Admin and Accountant approve and pay free-text claims; a receipt lets them check them.

**Rejected:** one multipart create (breaks the JSON contract, and a failed upload would lose the claim); making proof compulsory (the owner has not asked for it).

**Cost:** the proof helpers (file-type sniffing) are copied from HR into Field Activity, since a module's internals are private. Web does not show the files yet; the phone has no upload control yet. Not tested against a live Cloudinary account.

---

## 2026-10-10 — Visuals shown to each doctor: a standing list the MR adds to and a manager or Admin controls

**Decision:**
- **Each Doctor has one standing list of Visuals** — what their MR chose to show them (`DoctorVisual`, one row per doctor and visual). It is not a per-call log: reopening a doctor shows the same list, each pick with who added it and when. Product visuals and general (no-product) visuals can both be picked; the MR chooses from all active Visuals.
- **The MR can only add.** Earlier picks show ticked and locked in the app. Taking a pick off is for **Admin and any manager above the doctor's MR** (anyone with the MR in their downline); the MR gets 403. Removal is soft (`removedAt`, `removedBy`), and adding the same visual again brings the row back as added now.
- A visual **Admin has since deactivated** drops out of the MR's list but stays visible, marked inactive, to Admin and managers.
- **Mobile flow:** Visuals → choose a doctor → tick visuals → Submit; **Show** then walks through that doctor's visuals (pictures in the app, PDFs and videos in the phone's viewer). Submit needs a connection.
- **Web:** a new Admin **Visuals** library page (upload, edit title/category/product, activate/deactivate) and a **Visuals** tab on the doctor screen that lists the picks and lets Admin remove one. `PATCH /marketing/visuals/:id` now also edits title, category and product (it only set status before).

**Why:** MRs show different material to different doctors, and the company wants to see what was shown and correct it.

**Rejected:** a per-call record tied to the DCR (more to build, and the owner described a list per doctor); letting the MR remove their own picks (the owner said add-only).

**Cost:** the list belongs to the doctor, so a doctor reassigned to another MR keeps the list. Managers who are not Admin have no screen for removing yet: the API allows it, the phone only lists the MR's own doctors, and the web portal is Admin-only.

**Needs a migration:** none (a new `doctorvisuals` collection with a unique (doctor, visual) index).

## 2026-10-09 — Distributor monthly statement: opening, primary (+ adjustment), secondary, closing

**Decision:**
- **Definitions**, per distributor, product and month: opening = stock held at the start of the month; primary = what the company sent to the distributor (Done orders marked Done in the month + an adjustment); secondary = what the distributor sold on; closing = stock at month end; **opening + primary − secondary = closing**. Chemists are not part of these figures (K31 stands). *The owner's own words for "opening" were loose; read as stock at the month's start, to be confirmed.*
- **Two sources, one result.** Field workers (MR or any assigned field employee) keep submitting opening and closing counts from the phone (`MonthlyStock`, unchanged). Admin now also enters, on the web, the distributor's own sales statement — opening, the secondary it reported, and an adjustment to primary with a required reason (`StockStatement`, with a history of changes). **A statement that states a secondary is the figure used**; otherwise the field count. When both exist and differ, the row is flagged `COUNT_MISMATCH` rather than one silently hiding the other. This **adds to** the old rule (secondary derived from the MR's counts) instead of replacing it; "Use field count" copies a count into the statement in one click.
- **Adjustment** = stock supplied without an app order (+) or returned (−), added to the Done orders' total; valued at the product's PTS (a product with no PTS is counted in units and flagged unpriced). Secondary stays valued at PTR (K22).
- Admin entry has **no deadline** (any past month, in an open financial year); the field-count path now also refuses a month of a closed financial year (it lacked the guard).
- The Sales report (year chart, monthly statement) follows the precedence; the Stock report still shows the field counts only. Reports gain Adjustment and Source columns and the flags `COUNT_MISMATCH` and `NEGATIVE_CLOSING`.

**Replaces:** the "secondary is derived from the MR's counts only" wording of K9/K31 for a distributor that has a statement; the old PRD glossary definition of secondary ("stock remaining at month end").

**Needs a migration:** none (a new `stockstatements` collection).

## 2026-10-09 — Distributors list: quick payment and visible row actions

**Decision:** each row of the Distributors list has **Payment** (the same Record payment modal as the distributor's Payments tab, so a collection is entered without leaving the list), **Edit** and **Deactivate / Reactivate**, instead of the 3-dot menu; a new **Collected this month** column shows what has been recorded so far (recorded payments only, month to date, kept inside the financial year in view). Only this table: the shared 3-dot `RowActions` stays on the other tables. The column is fed by `GET /api/sales/distributor-payments/totals`, one grouped query, because the distributors list itself lives below Sales and cannot carry payment figures.

**Needs a migration:** none.

## 2026-10-09 — Distributors: several routes, one list of assigned people, no order flags, and payment collection

**Decision:**
- A **distributor can have several Routes**, all in one Zone (the form picks the Zone first, or adds one, then ticks Routes inside it; the Zone itself is not stored). The API refuses Routes from different zones. Chemists keep one Route.
- **Assigned people** are one list of any active field employees, of any designation, replacing the one MR + one ASM slots (sign-off C2). They are who can place orders and stock counts for it, as the assigned MR was before; the ASM slot was never used by any rule.
- The **"Orders" card (Primary sales / Secondary sales Allowed / Not allowed) is removed**, and with it `primarySalesEnabled` / `secondarySalesEnabled` from the API, the contracts and the phone's sync snapshot. Nothing ever read them (order placing ignores them); Admin had been asked to answer a question that changed nothing. The sync snapshot now carries `routeIds` instead of `routeId`, and no flags — fine because the mobile app is not built yet.
- **Payment collection is entered in this app** (resolves sign-off E6): Admin or the Accountant records each payment against a distributor (date not in the future, amount, mode, reference, note). A payment is never edited; a wrong one is cancelled with a reason and stays listed, out of the totals. A distributor's page has Details, Payments (collected against ordered for a range) and Orders tabs.
- Adding a chemist or a distributor uses the employee wizard's shell, like the doctor form (decision-log, same date).

**Replaces:** sign-off C2 (one MR, one ASM) and the order flags of the Master spec M6.

**Needs a migration:** yes — `pnpm --filter @greynote/api migrate:distributors` (dry run first, then `-- --apply`): `routeId` → `routeIds`, `assignedMrId` + `assignedAsmId` → `assignedUserIds`, the flags removed. Applied to the dev database on 2026-10-09 (3 sample distributors). It must be run before the new API serves a database that has old distributors.

## 2026-10-09 — The add-doctor form uses the employee wizard's shell with no explanatory text; dropdowns scroll

**Decision:**
- Adding a doctor now looks like adding an employee: a centred card with the shared `Stepper` (Details, Location (optional), Review) and a Back / Next footer. The pill steps, per-step card titles and descriptions, field hints and the long Review disclaimer are gone; the labels say the rest. Errors show for a step only after Next is pressed on it. Editing a doctor keeps one page, in the same lean style.
- The location picker (also used by the chemist and distributor forms) shows the search and the map; latitude and longitude are behind "Enter coordinates" and open by themselves when one is wrong.
- `Select` now caps its list at 20rem (or the room on screen) and scrolls it. Before, a long list (Specialities can be ~100) ran off the screen and could not be scrolled, in every screen that uses it.
- `StepFrame` and `Grid` moved to `components/ui/WizardParts.tsx` so both wizards share them. No draft saving for doctors (no API for it).

**Needs a migration:** none.

## 2026-10-09 — Sales Dashboard: achievement is typed in, targets and achievements are bound to the current financial year

**Decision:**
- A new report, **Sales dashboard** (`GET /api/reports/sales-dashboard?from=&to=`; web `/reports/sales-dashboard`), lists **field employees only** (active users with the FIELD role; office staff never appear). Per employee: name, zone, designation, route(s), day plan, DCR, TA, DA, target and achievement. The period is Today, Last 7 days or a custom range of at most 93 days; a range's end is held to today.
- **Day plan and DCR** are Yes/No for one day. Over several days they show **approved of N and submitted of N**, where N is the employee's **working days** (not before joining, not a holiday, weekly off or approved leave, from Attendance). *Submitted* = SUBMITTED, MANAGER_APPROVED or APPROVED (as sign-off B7); *approved* = APPROVED. **TA and DA** are the sums of accepted, non-cancelled expenses in the range.
- **Achievement is entered by hand** per employee per month (`Achievement`: unique on user + month, zero allowed), by Admin for anyone or a manager for their downline (not themselves). This **replaces "achieved is derived from orders" (sign-off E8, HLD 08 §3) for the Sales Dashboard**; the target-summary endpoint (`GET /api/marketing/targets/:userId`) still derives its `achievedPaise` from orders, so the two figures can differ until the client decides which one wins.
- The dashboard's **target** is the existing general `Target` row (no product, no campaign) for the month of the range's last day.
- **Financial-year bound:** a target or an achievement can be set only for a month of the **current** financial year (`OUTSIDE_FINANCIAL_YEAR` otherwise), and not in a closed year (`FY_CLOSED`). This also applies to the existing `POST /api/marketing/targets`.
- **Access:** Admin sees every field employee; a manager sees their downline; a field employee with no team is refused. This is the one report that is not Admin-only (it replaces K24 for this report only); the web menu entry is Admin-only for now.

**Replaces:** E8's "achieved is never stored" for this report only; K24's "every report is Admin only" for this one report.

**Needs a migration:** none (a new `achievements` collection; no existing data changes).

## 2026-10-09 — A CTC is entered with a Basic %, and its breakdown can be shaped per employee

**Decision:**
- Setting a CTC takes two inputs, **CTC and Basic %** (30–60%, two decimals; the org's own % when left empty), and the breakdown follows the org's pay components. For that one employee any line can then be changed (FDA 14% of Basic instead of 10%; what a percentage is of; or a fixed amount), removed, or added, and the lines always add up to the CTC: **Other allowance** (the balancer) takes whatever is left, and edits that add up to more than the CTC are refused with the shortfall.
- **Basic and the balancer cannot be removed or re-ruled**; a line another line is worked out from (FDA, under EPF) cannot be removed until that one is changed.
- A revision stores only the **differences** from the org formula (`structure`: `basicBasisPoints`, `ruleOverrides`, `removed`, `extras`), next to the frozen `lines`. So when Admin changes the org formula and re-applies it, everything an employee never touched follows and their own edits **stay**; promotions with a new CTC also keep the employee's structure. The old per-line amount `overrides` still work and read as fixed-amount rules when a CTC is revised.
- The same editor is in the employee wizard's Pay step; the draft keeps the structure and finalize passes it to the CTC step.
- The Basic and balancer rules, the 30–60% bound and the "one balancer" rule are the existing ones in `validatePayComponents`; nothing in payroll changes (it reads the frozen lines).

**Needs a migration:** none (older revisions have no `structure` and read as the org formula).

**Why:** HR needs one employee's Basic share, FDA rate, or an extra allowance to differ without changing everyone's formula.

---

## 2026-10-09 — The employee list shows manager and zone; the current HQ and zone are copied onto the employee profile

**Decision:**
- The Employees table shows Employee, Employee ID, Designation (office staff show their role), Manager, Zone (HQ beneath it) and Status; the Role column is gone (its filter stays). The whole row opens the profile (pointer cursor, hover tint); links, buttons and a text selection inside the row do not trigger it. `DataTable` gets an optional `onRowClick` for any list to adopt.
- `EmployeeProfile` gains `hqId` and `zoneId`, a **copy of the employee's current HQ and its zone**. Territory still owns the assignment and its history; `SetUserHq` writes the copy through a new Identity contract method, `recordUserTerritory`, after the assignment is saved, and also when the same HQ is saved again (so a failed write is repaired by saving it again). A zone never changes for an HQ (an HQ edit can change name, status and base place only), so only a change of HQ moves it. Ids are stored, not names, so renames need no update.
- The list API returns `managerName` (one batched lookup for the page), `hqId` and `zoneId` per row; the web turns the ids into names with the zone and HQ lists it already loads.

**Why a copy:** Identity sits below Territory and cannot read it, and a second per-row lookup would make the list slow and noisy; the copy also makes a server-side zone filter and sort possible later.

**Needs a migration:** `pnpm --filter @greynote/api migrate:profile-territory` (dry run first, then `-- --apply`) copies the current HQ and zone onto profiles of employees who already have an HQ. Until it is run those employees show "—" for Zone. Not yet run.

---

## 2026-10-09 — Tables are flat and full width, with a page-size choice and an entries footer

**Decision:** every list table loses its surrounding card and runs edge to edge (`DataTable` `bleed`), with a tinted sentence-case header row, thin row lines, a `ListToolbar` above it and a footer of rows-per-page plus "Showing x to y of N entries". `pageSize` (10/25/50/100, default 25) is a URL parameter next to `page`. `Card` gains `flat` for a heading over a flat table; chart cards, form cards, the payslip print layout and modal tables keep their boxes.

**Replaces:** a bordered `Card` with `p-4` filters and `px-5` cells inside a page that already had `px-8`, which made tables feel narrow, and the "N total" footer. No API change (the API already took `pageSize` up to 100). Default page size moves from the API's 20 to 25.

**Needs a migration:** none.

**Why:** owner wanted tables "very simple", like a modern admin list, and applied site-wide.

---

## 2026-10-09 — New field employees are added in one guided wizard with drafts; the employee id and password are generated at the end; the top designation has no manager

**Decision:**
- `/employees/new` is one eight-step wizard: **Personal** (name, mobile, alternate mobile, guardian, date of birth, ESI number, joining date, probation), **Address** (present, and permanent with a "same as present" box), **Qualifications** (repeatable, optional), **Experience** (repeatable, optional), **Bank**, **Work** (designation, zone → HQ, manager), **Pay** (grade, optional CTC), **Review**. A step opens only once every step before it is valid. Required: personal, address, bank, work, pay grade. Optional: alternate mobile, ESI, joining date, probation, qualifications, experience, CTC.
- **Drafts:** every Next saves the form to a new `EmployeeDraft` collection (not a `User`), so no login and no employee id exists until the last step. "Save draft" leaves; the Employees page lists drafts to continue or delete. `POST/GET/PATCH/DELETE /identity/employee-drafts`, `POST …/:id/finalize`.
- **Finalize** creates the login, profile, HQ assignment and CTC through the existing use cases, deletes the draft, and returns `{ employeeCode, password }` once. It is not one transaction (HQ is Territory's), so a failure keeps the draft and remembers the login it made; pressing Create again reuses that login with a fresh password instead of making a second employee.
- **Employee id** is `GRN` + a 4-digit number from a `counters` document bumped with an atomic `$inc` (`GRN0001`; past 9999 it grows). On first use it starts above the highest existing `GRN\d+` code. Older hand-typed codes are untouched. The **password** is generated on the server (12 characters, no look-alikes) and shown with Copy and Share (Web Share API where the browser has it).
- **Top designation:** the designation with the highest level that exists reports to nobody (a client that stops at ZSM has no NSM row, so ZSM is the top); every other designation needs a manager. `computeUserStatus` takes this into account, so such an employee can be `active` with no manager.
- `EmployeeProfile` gains `alternateMobile`, `permanentAddress` + `permanentSameAsPresent`, address `line1`/`line2`, `qualifications[]` and `previousEmployment[]` (all default empty, no migration). The old free-text `qualification` stays readable.
- The old create screen remains at `/employees/new/staff` for Admin, for office logins (HR, Accountant, Admin) only.
- The wizard drops the explanatory text under headings and fields, the per-step Cancel/Save, and "Finish later"; its footer is Back · Save draft · Next. The progress bar is a connected stepper (tick when done, ring on the current step, later steps locked).

**Not changed:** permanent address and HQ are required by the wizard but **not** by `computeUserStatus`, so existing active employees do not drop to `pending`. The profile screens (`/employees/:id`, `/setup`) do not yet show or edit the new fields; they keep working on the old ones.

**Needs a migration:** none.

**Why:** HR wanted one ordered flow that cannot skip ahead, can be paused, and hands over a ready login, instead of a typed code and password followed by six separately saved sections.

---

## 2026-10-05 — Pay grades carry a required CTC range that is enforced; grade names are free; designation levels are fixed; the screen is "Pay grades"

**Decision:**
- A Pay Band (grade) has a required `ctcMinAnnualPaise` and `ctcMaxAnnualPaise` (`0 < min ≤ max`, both ends allowed). It **replaces** `suggestedCtcAnnualPaise`. Assigning an employee's CTC outside their grade's range is a `400` naming the grade and both bounds, and an employee with no grade can't be given a CTC. The average (midpoint, half up) is derived and shown with min and max wherever a grade is chosen (employee Profile, Compensation tab, CTC dialog, the grade list). The ₹1.44 lakh soft warning is gone: the grade's minimum is the floor now. A formula re-apply keeps each employee's CTC and is not range-checked.
- **Grade names are free text** (up to 20 characters, unique ignoring case via `nameKey`, renamable), no longer the closed list G1/G2/G3 — which is why a fourth could not be created. Nothing downstream keyed on the names (Leave Master and Payroll use the grade id).
- **Designation `level` is no longer entered:** it follows from the name (MR 1, ASM 2, RSM 3, ZSM 4, NSM 5) in code, and the Designations edit endpoint is removed (nothing is left to edit). No rule used `level` except ordering.
- The screen is **Pay grades** at `/pay-grades` (`/pay-bands` redirects); the API path and code names stay `pay-bands` / `PayBand`.

**Needs a migration:** `pnpm --filter @greynote/api migrate:payband-range` (dry run first) — sets `nameKey`, and turns an old suggested CTC into a placeholder min = max range for HR to widen. A grade with neither stops the run. Run it before starting this version.

**Why:** the client wants pay bounded per grade rather than a loose suggestion, and a fixed three grades did not fit the org. **Open for the client (sign-off):** the actual min/max per grade.

**Refs:** `apps/api/src/modules/identity/{domain/payBand.entity,application/usecases/assignCtc.usecase}.ts`, `apps/api/src/scripts/migrate-payband-ctc-range.ts`

---

## 2026-10-05 — CTC replaces the flat Pay Band salary: one org-wide formula of Pay Components, a CTC per employee

**Decision:** a FIELD employee's pay is a **CTC** (annual, whole paise) split by **one org-wide formula** made of *Pay Components*, instead of `PayBand.baseSalaryPaise`.

- **No Paygroup.** Considered (a named rule set assigned to employees) and dropped: the org has one formula, so it would be a table with one row. Variation is per employee (below), not per group.
- **Pay Components** (Admin/HR master): `code`, `name`, `kind` (`EARNING` / `EMPLOYER_CONTRIBUTION`), `order`, `isActive`, and a rule — percent of CTC, percent of other components, fixed amount, or the **balancer** (exactly one; takes the rest). Percentages are whole basis points. Seeded: Basic 30% of CTC, FDA 10% of Basic, EPF 12% of Basic + FDA, ESI 0.75% of CTC, Medical (fixed, Admin-set), Other allowance (balancer). HRA, Conveyance etc. are added by Admin as data. Basic is validated 30–60% of CTC; the formula must keep one balancer, no loops, and no reference to an inactive component.
- **Rounding:** each figure rounds half up to a whole paise once; the balancer absorbs the difference, so lines always sum to the CTC exactly. A formula that leaves a negative balancer is a 400.
- **Per employee:** HR picks the Grade and types the CTC; the breakdown fills from the formula and HR may override any line (the balancer is never overridden). Overrides are kept, and components that are a percentage of an overridden line follow it.
- **Append-only revisions** (`CtcAssignment`: CTC, `effectiveFrom` month, frozen lines, overrides, reason, who). A package change is a new revision; the one in force for a payroll month is the latest `effectiveFrom` not after it, ties to the one saved last. Editing the formula **does not** rewrite saved breakdowns; `POST /identity/ctc/reapply` saves fresh revisions from a chosen month (same CTC and overrides), each employee independent.
- **Employer EPF/ESI are inside the CTC**, so the employee's monthly gross is `(CTC − employer EPF − employer ESI) ÷ 12`. Employee-side deductions on the payslip are **deferred**.
- **The 1.44 minimum is not enforced** (read as ₹1.44 lakh a year; the UI will only warn). **Grade** keeps TA/DA rates and leave policy, and gains an optional `suggestedCtcAnnualPaise` that pre-fills the CTC box.

**Status:** backend built. Payroll reads `getCtcForMonth`: `PayrollRun.baseSalaryPaise` is the monthly gross, the run also freezes `ctcAnnualPaise`, `ctcEffectiveFrom` and `ctcLines`, and an employee with no CTC in force is skipped `NO_CTC` (replacing `NO_PAY_BAND`). `PayBand.baseSalaryPaise` is removed; `pnpm --filter @greynote/api migrate:payband-ctc` turns each grade's old monthly salary into a suggested annual CTC (×12) and removes the field. Runs already generated keep their numbers. **Every employee needs a CTC assigned before the next payroll** — none exist until HR does it. Web: `/pay-components` (formula, re-apply), the employee's Compensation tab (live breakdown, line edits, history), and a suggested CTC on the Pay Band form; a CTC under ₹1,44,000 shows a warning and still saves.

**Assumptions for the client (sign-off):** the unit of 1.44; ESI applied to everyone as stated (the statute has a wage ceiling); employee-side deductions later; revisions start at a chosen month with no mid-month proration.

**Refs:** `apps/api/src/modules/identity/domain/{ctcBreakdown,payComponent.entity,defaultPayComponents,ctcAssignment.entity}.ts`, `application/usecases/{assignCtc,previewCtc,reapplyCtc,*PayComponent}.usecase.ts`, `interface/ctc.route.ts`

---

## 2026-10-03 — DCR approval is a switch; Daily Plans come from the approved Monthly Plan; approvers get a turnaround; stock is due on the 5th

**Decision:** four connected changes, each driven by a `SystemConfig` key so Admin changes them without a release.

1. **`DCR_APPROVAL_REQUIRED`** (default `true`, HIGH impact). On: unchanged (manager, then Admin unless `APPROVAL_MANAGER_ONLY_KINDS` lists `DCR`). Off: a submitted DCR is recorded already `APPROVED` (history `SUBMIT`, authority `AUTO`; no approver sees it) and its TA/DA is generated in the same transaction. The day's Daily Plan must still be approved (the DCR gate is untouched), and no DCR submit still means no TA/DA. The setting is read at submit; requests already waiting keep their path.
2. **Daily Plans are inherited.** When a Monthly Plan is past the manager, each of its entries from today on is written as that day's Daily Plan (`source: MONTHLY`, a draft). The employee **cannot edit it** (`PLAN_INHERITED_READONLY`) but **still submits it every day, and the manager still approves it** — inheriting approves nothing. A manager above the employee, or Admin, can **amend** the day (`PATCH /planning/daily/:id/amend`): a reason is required, the previous body is kept on the plan, the day is validated against the employee's own routes, and an already approved day stays approved. Refused once that day's DCR is submitted (`TA/DA` follows the plan's routes) and for a day that is over. Re-approving the month refreshes only inherited days that were never submitted or amended. A day the month didn't cover is still written by the employee (`source: MANUAL`). TA/DA keeps being worked out from the approved Daily Plan's routes.
3. **A call stays inside the day's approved Plan.** A Doctor or Chemist Call whose Route is not in the Plan is refused `ROUTE_NOT_IN_PLAN`; a meeting day (no Routes) has no calls. The fix is for the manager or Admin to amend the plan, then the employee logs.
4. **Approver turnaround and the stock deadline.** `APPROVAL_SLA_DAYS` (default 3): a request open longer than that at its current stage (from submit, or from the manager's approval) is returned with `overdue: true` and `dueAt`. It is a **flag only** — nothing is auto-approved or re-routed, and Admin can always approve (unchanged). `MONTHLY_STOCK_DEADLINE_DAY` (default 5) **replaces `MONTHLY_STOCK_GRACE_DAYS`**: month *M*'s opening and closing stock is due by the end of that day of the following month. The Monthly Plan deadline stays `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` (28th).

**Supersedes:** "Monthly stock: due on the month's last day" (2026-09-30) — back to a day in the following month, now configurable. The in-day change request (B9) is **kept** as the employee's way to ask for a change for today; the manager can now also amend directly.

**Why:** the Monthly Plan is the real plan; a daily one that can drift from it, and a report that can drift from the daily one, defeat the approval. Letting only a manager or Admin move a day keeps one accountable person for every deviation.

**Rejected:** auto-approve after the turnaround (releases TA/DA unreviewed); inheriting straight to approved (the client wants a daily submit and approval); a "flag, don't block" off-plan call (the client wants the report held to the plan — can become a setting later).

**Cost:** the manager must be reachable for any change on the day; there is no web screen to find a team member's plan yet, so amend is API-only for now. Plans approved before this change need the one-off `migrate:inherit-monthly` to get their days.

---

## 2026-10-03 — Territory flattened: `Zone → HQ → Route`, a Route runs from its HQ's base place to one destination

**Decision:** **Reverses the `Area` half of** "Territory, Distributor, Doctor assignment and DA re-aligned to the client's Master spec" (2026-09-24). The other three calls in that entry (Distributor on a Route, one active Doctor assignment, per-type DA rates) stand.

- **`Area` is removed.** The hierarchy is `Zone → HQ → Route`. `Route.area_id` becomes `Route.hq_id`.
- **An HQ has a base place** (`label`, `latitude`, `longitude`, `place_id`), e.g. SLG-1 and SLG-2 are two HQs whose base place is Siliguri. It is required on create. HQs that exist before this change have none until an Admin sets one.
- **A Route is one destination place** reached from its HQ's base place (SLG-1 → Naxalbari, SLG-1 → Dhupguri). `waypoints[]` (2–25 stops) is replaced by a single `destination`. The distance is base place → destination, from the same Google Routes call as before, with manual override and retry kept. Still never doubled (sign-off D7).
- **The DA tier moves to `Route.type`** (`HQ | EX_STATION | OUT_STATION`), set by the Admin when the Route is created. The DA rule itself is unchanged: the highest type among the day's Routes wins, and `MEETING`/`CONFERENCE` use the HQ rate. The three per-grade DA rates on Pay Bands are unchanged.
- **Changing an HQ's base place recalculates its active Routes** that are not manually overridden. Overridden Routes keep their distance and are reported back to the Admin, so one edit never silently throws away a hand-entered distance.
- **CSV import covers Zone and HQ only.** The `area` and `area_type` columns go. An HQ's base place needs a map-confirmed pin, the same reason Routes were never imported.

**Why:** the client's real structure is a headquarters town with routes out to nearby places. A Route is "from Siliguri to Naxalbari", not a path through waypoints, and Area added a level that the client does not use. The distance the client needs is between two places.

**Rejected:**
- DA tier derived from distance bands: it needs thresholds that the client has not given, and it would change what is paid for existing Routes.
- DA tier on HQ: too coarse, since SLG-1 → Naxalbari and SLG-1 → a far place would be paid the same.
- An extra sub-base level under HQ for SLG-1/SLG-2: it adds a level instead of removing one.
- Keeping optional via-stops on a Route: it keeps the whole waypoint editor and map code for a case the client has not asked for.

**Cost:** multi-stop Routes are gone, so a trip through a stop is one Route per destination (or a manual distance override). Existing Routes need a one-off migration: `hq_id` from the Area's HQ, `type` from the Area's type, `destination` from the last waypoint. Sync payload, `RouteSummary`, `RoutePath` and the Distributor detail path change shape, with `areaType` renamed `routeType`. The field app has no territory code yet, so nothing there breaks.

**Refs:** sign-off D3, D4, D5, D8; [`LLD/territory.md`](LLD/territory.md); [`erd/02-territory-master.md`](erd/02-territory-master.md); [`hld/02-route-distance-calculation.md`](hld/02-route-distance-calculation.md); [`hld/06-ta-da-auto-calculation.md`](hld/06-ta-da-auto-calculation.md)

---

## 2026-10-03 — Every Config setting is defined in one registry

**Decision:** `modules/config/domain/configDefinitions.ts` defines all 30 settings once: label, description, type (yes/no, whole number, time,
month, weekday, timezone, list of approval kinds), limits and unit, default, and an impact level with a note for the five that change how the
system reads dates or who can act (the business timezone, the financial-year start month, the weekly off day, the missed-report block, and the
manager-only approval kinds). The seed is built from it. The limits are the ones each reader enforces when it parses the value.

**Why:** found while planning the System settings screen. Config validated nothing on write, so `banana` for a cutoff time or `13` for the
financial-year month would be stored and then fail on every read of that key. The screen needs the same facts (type, limits, warnings) the
server needs to validate, and one registry keeps them from drifting.

**Also:** `GET /config` (Admin) lists every setting with its value, rules, default, who changed it and when, and flags a stored value that breaks its own rules (with why) rather than hiding it.

**And:** `PATCH /config/:key` now checks the value against its definition (a `400` naming the rule) and stores it in the form the readers expect (a month in capitals, a time as `HH:MM`, a list of kinds de-duplicated). A key with no definition is a `404`. One rule spans two settings: the latest daily-plan resubmit time must be after the plan deadline, whichever is being changed; a bad older value in the other one does not block fixing this one.

**And:** `GET /config/public` (any signed-in user) returns only the financial-year start month (1 to 12) and the business timezone, so clients read "this year" and "today" as the server does. A stored value that breaks its rules falls back to the default there, so a client still gets an answer, while the Admin's settings screen shows the fault.

**Cost:** a reader's limit and its definition are written twice (the reader's own parser and this registry), kept honest by a test that every
default passes its own definition and equals what the seed always wrote, and by the readers' own tests. A time is accepted only as `HH:MM`
with two digits each, because that is all the deadline code accepts. A timezone is kept as typed once `Intl` accepts it: `Intl` reports a
legacy alias for some zones (`Asia/Calcutta` for `Asia/Kolkata`), so its own spelling is not used.

---

## 2026-10-03 — Payroll rows carry the employee's name and code

**Decision:** every payroll row the HTTP API returns (get, list, finalize, and each line of a generate result) now has `userName` and
`employeeCode`, resolved in one batched Identity call per response. The stored `PayrollRun` and the public contract are unchanged.

**Why:** found while planning the Accountant screens. A run holds only a `userId`, so a sheet of a few hundred employees would have
needed a few hundred lookups to show a name. The expense audit already returns the name and code on each row.

**Cost:** one extra Identity read per payroll response; the contract still returns the stored run.

---

## 2026-10-03 — A plan change and a doctor service can be read by their own id

**Decision:** two read endpoints, `GET /planning/changes/:id` and `GET /field-activity/doctor-services/:id`, with the same readers as
their siblings (the owner, their managers and Admin for a change; Admin or the tied MR for a service; anyone else a `404`).

**Why:** found while planning the approval previews. An approval request points at the record it is about by its own id, but a plan
change could only be read through its plan's id and a doctor service only through a filtered list. The portal could not show
Admin what a request was asking for.

**Cost:** two more GET routes, classified in the Financial Year route guard as by-id. No change to existing callers.

---

## 2026-10-03 — Admin and HR can list decided approval requests: `GET /approvals/all`

**Decision:** a new `GET /approvals/all` (HR, Admin) returns requests in any status, newest first, with the inbox's filters and row shape.
Admin sees every request; HR sees the kinds it is a final approver of (Leave). It is scoped to the selected Financial Year, like the other lists.

**Why:** found while planning the Approvals screen. The inbox is open requests only, `/team` is for field managers and `/mine` is the caller's
own, so Admin and HR had no way to see a decided request, and `reopen` (Admin, Approved only) was unreachable without already knowing an id.

**Cost:** none to existing callers; one more route, classified in the Financial Year route guard.

---

## 2026-10-03 — Employee documents must really be a PDF, JPG or PNG

**Decision:** `POST /identity/users/:id/documents` refuses any file whose own leading bytes are not a PDF, JPEG or PNG, with a
`400` before anything is stored. The check ignores the file name and the declared `Content-Type`. A file Cloudinary cannot read
(a corrupt PDF) is also a `400`, not a server error. The web form already offered only those three types.

**Why:** the endpoint accepted anything up to 10 MB and stored it publicly through Cloudinary's `resource_type: auto`. Marketing
already refuses executables and corrupt files; employee documents held personal data and had no check at all.

**Cost:** a PDF with more than 1 KB of junk before its header is refused, as most readers would refuse it too. A Word file or
a GIF is not accepted; the client's document types are scans and photos.

---

## 2026-10-03 — A deactivated account can't sign in, and deactivating signs the employee out

**Decision:** an account with `status: inactive` is refused at login (`403`, after the password check so existence is not
revealed, and before the device registry so no phone request is created) and at refresh (`401`, ending the user's sessions).
Setting `status: inactive` through `PATCH /identity/users/:id` revokes every session of that employee at that moment, once, on
the transition only.

**Why:** found while building the Security tab. "Deactivate" only changed a field: nothing read it at login, so an offboarded
employee could keep signing in and submitting. `status` is sticky by design and no endpoint reactivates, so this is
effectively offboarding; it has to cut access.

**Cost:** an access token already issued stays valid until it expires, up to 15 minutes, because the auth middleware verifies the
token and does not read the database. Reactivation does not exist; it would be a deliberate new endpoint.

---

## 2026-10-03 — A manager can't create a reporting loop; optional profile fields can be cleared

**Decision:** (1) `PATCH /identity/users/:id` refuses a `managerId` that is the employee or that already reports to them,
directly or through the chain. (2) `guardianName`, `qualification` and `dateOfJoining` accept `null` to clear them; a missing key
still means "leave alone". Required onboarding fields stay changeable but not clearable. (3) `dateOfBirth` is now parsed from a
string, because `z.coerce.date()` turned `null` into 1 January 1970 instead of refusing it.

**Why:** the first two were found while building the Employee detail screen. With only an existence check, two employees could be
set to manage each other and the approval chain would never reach the top; and a wrongly entered guardian could never be removed.
Clearing a required field would silently turn an active employee back into `pending`, so that stays a deliberate refusal.

**Cost:** the loop check is one read per level above the new manager (about five). It does not repair loops that were already in
the data; those are tolerated as before.

---

## 2026-10-03 — HR manages Designations and Pay Bands; the Accountant can read Pay Bands

**Decision:** `GET/POST/PATCH /designations` and `/pay-bands` are open to **Admin and HR** (were Admin only). `GET /pay-bands`
is also open to the **Accountant**, read only. `/roles` stays Admin only; it is a fixed set of four names.

**Why:** PRD §5.3 gives HR the Employee Lifecycle (assign Designation and Pay Band) and the Accountant view-only access to pay
grades. With Admin-only reads, HR could not fill the pickers needed to complete a FIELD employee's profile. The client confirmed
HR also maintains these records.

**Cost:** HR can change the rates behind future TA/DA and payroll runs. A finalized PayrollRun is unaffected, because it
snapshots `base_salary` at generation (Phase 7).

---

## 2026-10-01 — Routes screens: full pages, map preview with its own browser key

**Decision:** Territory Routes get a list page, a create page and a detail page (details, stops & distance, assigned MRs)
rather than dialogs. The stops editor shows a **map preview** (numbered pins, dashed straight line captioned as not the driving
route), which needs a separate browser-side Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional, referrer- and
API-restricted); without it the map shows a fallback and everything else works. Place search is debounced, 3+ characters,
cached and never retried.

**Why:** a route has an ordered list of up to 25 stops, a distance state, a rate override and assignments — too much for a
dialog. The map makes order and geography checkable at a glance. Keeping the API's server key and the browser key separate means
the key that can call billed Places/Routes APIs never ships to a browser.

**Rejected:** no map (list-only was the cheaper default, but you chose the preview); drawing a road-shaped line (the API has no
geometry and the browser key is not scoped to Directions); free-text stops (only a searched place has a `placeId` and a verified
location); dialogs like Zones/HQs/Areas.

**Cost:** one more key to create, restrict and watch for billing; each map load and each place search is a billed Google call;
the straight line can be mistaken for the route despite its caption.

---

## 2026-10-01 — Territory tree deferred until after the MVP; back to dedicated Zones / HQs / Areas pages

**Decision:** The single `/territory` tree page (entry below) is reverted. Zones, HQs and Areas are separate pages again
(`/zones`, `/hqs`, `/areas`, each its own nav item). The icon-only navigation rail from the same change is kept. A tree view of
the hierarchy is a post-MVP idea, to be designed properly then.

**Why:** the tree page offered one primary action ("New zone") and pushed every other action into row menus, which made the
page feel thin and the common tasks harder to find than on a dedicated list with its own New button, filters and columns.
Redesigning the page properly is not MVP-critical, and the dedicated pages already cover every Territory task.

**Cost:** three nav items under Master data instead of one, and no at-a-glance hierarchy view. The reverted work (an accessible
tree primitive, lazy per-branch loading, flat cross-level search) is in git history at `d9b69e3` if a tree is wanted later.

---

## 2026-10-01 — Icon-only navigation rail and one Territory tree page

**Decision:** (1) The sidebar is a light, accent-tinted icon rail that expands over the content on hover or keyboard focus,
without changing the page layout; below `lg` it stays a drawer. (2) Zones, HQs and Areas are one page at `/territory`, a tree
whose branches load lazily when opened; the old `/zones`, `/hqs`, `/areas` URLs redirect there. A search shows a flat results
list across all three levels.

**Why:** the rail gives every table about 200px more width without making navigation harder to reach, and expanding as an
overlay means nothing jumps. The tree matches how the data is shaped, removes the "which page do I add an area on?" hop, and
lazy loading is the only approach that is correct against an API that caps lists at 100 — fetching everything up front would
silently truncate in a large org.

**Rejected:** a pin-to-expand button (more state for little gain); a dark sidebar; loading the whole hierarchy in the browser
(truncates past 100 per list); keeping three list pages (three trips for one task).

**Cost:** an icon-only rail relies on recognisable icons (labels appear on hover/focus, and a touch device uses the drawer); a
branch with more than 100 children shows a "use search" note rather than paging; tree search cannot expand in place.

---

## 2026-10-01 — Dashboards: role-based work queues composed from existing endpoints

**Decision:** The dashboard is an operational, role-specific work queue (Admin / HR / Accountant), built by composing the list
endpoints that already exist; each tile owns its query and failure state, links only to built screens, and refuses to show a
number it cannot compute correctly (capped lists show "500+"). Charts, `GET /dashboard/summary`, draggable widgets and dark
mode are deferred. The sidebar becomes a drawer below `lg`.

**Why:** the API has no aggregate or time-series endpoint, and a new cross-module backend module would have blocked the screen
for no immediate gain. Counts are available from `total` on the paginated lists and from array lengths elsewhere. A dashboard of
fabricated or undercounted numbers is worse than one that says "coming soon".

**Rejected:** a `/dashboard/summary` module first (delays the screen; it crosses several modules' `.public` contracts); one
shared query for the whole page (one failure would blank every tile); BI-style analytical/strategic dashboards (no trend data).

**Cost:** several requests per load (tiles refetch on focus), the expenses tile can only be exact under 500 unpaid claims, and
blocked-employee / missed-DCR tiles are placeholders until endpoints exist. Noted for later: `GET /identity/users?isBlocked=false`
is parsed as `true` (`z.coerce.boolean()`), so only `isBlocked=true` may be sent until the schema is fixed.

---

## 2026-10-01 — Web design system: white canvas, indigo accent, Inter, comfortable density

**Decision:** The portal's look is a white canvas with hairline borders (no grey page background), one indigo accent
(`accent-600`), Inter via `@fontsource-variable/inter`, and comfortable density (40px controls, 48px rows). Tokens are ramps →
semantic names → status triples (`bg/fg/solid`) in `apps/web/src/styles/tokens.ts`, mirrored in `theme.css`; a drift test and
a WCAG-AA contrast test guard them. Dark mode is deferred. A dev-only `/design` page is the living style guide.

**Why:** the first scaffold's grey-page-white-card look was a placeholder, and a retheme costs more with every screen built on
it. Semantic-only component classes make a later palette or dark-mode change a tokens edit. The contrast test already caught
one failing pair (`text-subtle` on the tinted surface, 4.42:1) before any screen used it.

**Rejected:** teal accent (collides with the "approved" green); compact density (HR and Accountant live in tables all day);
Google-hosted font via `next/font` (needs network at build time); a `packages/design-system` (see the entry below).

**Cost:** the accent hex is a placeholder until there is a brand colour; swapping it is one ramp in `tokens.ts` and `theme.css`.

---

## 2026-10-01 — Web portal setup: cookie-mode refresh, no design-system package yet, web on :3001

**Decision:** (1) The refresh token reaches a client by one of two routes, chosen by a request header. `X-Client: mobile`
gets it in the JSON body, as before. Anything else (the browser) gets it as an `httpOnly; SameSite=Strict` cookie scoped to
`/api/identity/auth` and it is left out of the body. `/refresh` and `/logout` read the token from the body, or from the cookie
when the caller sent an `X-Client` header. (2) New `GET /api/identity/auth/me` returns the signed-in `UserSummary`, so the web
needs no JWT decoding at boot. (3) `apps/web` is Next.js 15 (App Router, client-side panel), TanStack Query, Tailwind v4,
modelled on `../driverzone/apps/web`. (4) No `packages/design-system`: primitives live in `apps/web/src/components/ui`, tokens in
`apps/web/src/styles/tokens.ts` + `theme.css`. (5) Web runs on **:3001**; the API keeps :3000; `CORS_ORIGINS` defaults to
`http://localhost:3001`. (6) React is pinned to 19.2.3 workspace-wide via `pnpm-workspace.yaml` `overrides`, matching Expo.

**Why:** the API only returned tokens in the body, so a browser would have had to keep a 30-day rotating refresh token in JS,
readable by any XSS. A cookie keeps it out of reach; the header lets the phone keep its body contract with no change. The
header is a response-shape switch, not a security boundary: a caller that lies only changes where its own token is delivered.
React DOM / Radix / Tailwind components cannot be shared with React Native, so a UI package would have one consumer; only the
tokens could be shared, and they are kept in one file so they can be lifted out in Phase 10.

**Rejected:** tokens held in browser memory (refresh token exposed to XSS); a Next BFF proxying auth (a second hop and a second
place for session logic, for no gain once the API can set the cookie); moving the API to :4000 (touches env, Dockerfile,
healthcheck, docs).

**Cost:** the web and the API must share a registrable domain in production (SameSite=Strict), and `CORS_ORIGINS` must list the
portal's origin. Cookie reads on refresh/logout require a custom header, which forces a CORS preflight, as a CSRF guard on top
of SameSite. Reversing the cookie default later would be a breaking change for any browser client.

---

## 2026-09-30 — Financial Year toggle: a per-request header, read-only, out-of-range is an error

**Decision:** (1) The selected past financial year travels as a header, `X-Financial-Year: <start year>`, on each request —
stateless, nothing stored; absent or current = normal. (2) Any non-read request carrying a past-year header is `409
FINANCIAL_YEAR_READ_ONLY`, except login, refresh and logout. (3) On the scoped lists, dates left out default to the year's
range and dates outside it are `400 OUTSIDE_FINANCIAL_YEAR`. (4) Scope: DCRs, expenses, plans, leaves, orders, payroll runs,
the approval lists and leave balances; not products/chemists/campaigns/holidays/targets/monthly stock; by-id reads are not
re-checked. (5) Payroll's list gains a `fromMonth`/`toMonth` range so a year can be listed; leave balances are no longer
created when a past year is viewed. (6) A test lists every GET route and fails if one is not classified.

**Why:** a header needs no server-side state or new endpoint, works the same for the phone and the web, and the
"read-only" rule is one check in one place instead of one per endpoint. Rejecting out-of-range dates makes a UI mistake
loud instead of showing a quietly wrong list. Viewing history must not write, and the leave-balance screen did.

**Rejected:** a stored per-user setting (state to keep in step across devices); trimming out-of-range dates silently;
checking every by-id read (the id only comes from a scoped list); leaving `POST /sync/push` open under the header (the
phone does not send it there).

**Cost:** each new dated list needs a scope line, which the guard test enforces. HLD 09's argument for read-only — a stale
approval would change a finalized payroll — is weaker now that payroll counts by paid month; the rule stays for
simplicity and the PRD's "view", and a stuck past-year item still has no path (sign-off J3).

---

## 2026-09-30 — Payroll: the month is the month an expense was paid; who runs it; ended months only

**Decision:** (1) Field Activity's `getPaidTaDaTotal(userId, month)` counts what was `PAID` **during** the month (by
`paid_at` in the business timezone), replacing "for report days in the month". (2) Accountant and Admin generate and
finalize payroll; HR never. (3) Only months that have ended can be generated. (4) A mid-month joiner is paid the full
base salary and the run carries `joined_in_month`; no proration until the client gives a rule. (5) The deduction is
`round_half_up(unpaid_days × base / 30)` with unpaid days capped at 30, and the run keeps `unpaid_leave_days` as a
snapshot. (6) PF/ESIC/Medical and salary overrides (F6, F7) stay out of the formula.

**Why:** with report-day months, an expense reported on 28 September and paid on 3 October — after September was
finalized — would reach no payroll ever; nothing can reopen a finalized run and Field Activity cannot see Payroll's
lock (it sits above it). Counting by paid date needs no lock at all, and matches how the Accountant works: pay, then
generate. Refusing the unfinished month stops a finalized sheet that misses the rest of the month.

**Rejected:** keeping report-day months and refusing late payments (needs a cross-tier lock hook); accepting the gap
(money silently missed); proration by joining date (the rule is the client's to give).

**Cost:** payments are counted in the month they were made, so an employee's September travel paid in October shows
in October's sheet; the two-fields-more `PayrollRun` differs slightly from the first ERD.

---

## 2026-09-30 — Marketing: one Target per key, what "achieved" counts, Visuals uploaded through the API

**Decision:** (1) A Target is unique per user + month + product + campaign; setting it again replaces it. (2)
"Achieved" is worked out live from Sales: orders by the user and their downline dated in the month, `PLACED` and
`DONE`, never `CANCELLED`; a product narrows to its lines; a campaign narrows to its dates inside the month; no filter
means the general target against all sales. Sales' contract gains `sumOrderAmount`. (3) Only Admin or a manager sets
Targets, for themselves and their downline. (4) Admin uploads a Visual to the API (multipart, ≤ 25 MB, image / PDF /
MP4-MOV-WebM), which stores it in Cloudinary; Cloudinary configuration moves to `shared/storage/cloudinary.ts`,
shared with Identity. Campaigns are company-wide, status-only edits.

**Why:** the ERD left uniqueness open, and a duplicate row would silently inflate a manager's rollup. Counting
cancelled orders would reward cancelling; counting only `DONE` would lag behind MRs who never mark them. Uploading
through the API keeps the storage account and the rules in one place, at the cost of buffering up to 25 MB per request.

**Rejected:** several Targets per key summed (double-count risk); an Admin-supplied file URL (the client asked for
upload); "any" as the meaning of an omitted filter (it would add a general and a product target together).

**Cost:** an MR without a team cannot set their own Target; unit prices and achieved both rest on MR-entered orders
(sign-off E7). Live run found and fixed a Campaign saved with no description (Mongoose reads `''` as missing) and a
corrupt PDF answered `500` instead of `400`.

---

## 2026-09-30 — Orders: lines embedded, server-side amounts, one winner on complete/cancel

**Decision:** (1) An Order and its lines are one document; the schema refuses a total that is not the sum of the
lines, an order with no lines, and both/neither outlet. (2) The server works out every line amount and the total from
quantity × unit price (whole paise, capped at `MAX_PAISE`); an amount sent by the phone is ignored. The MR enters the
unit price — Products have no price. (3) Only an MR places an Order; the order date defaults to today and may be past,
not future. (4) `PLACED → DONE/CANCELLED` is one conditional update: of racing calls one wins, the rest are `409`; the
MR who placed it or an Admin may do it, a manager may only read. (5) `ORDER` is a sync kind; completing and cancelling
are online. (6) Orders are not gated by the DCR compliance block.

**Why:** the ERD's separate `OrderItem` table would need a multi-document transaction for what is one fact; Mongo
does not enforce a denormalised total, so the schema does. Trusting a phone's arithmetic silently corrupts totals
Marketing will read.

**Rejected:** a price list now (no client rule for it yet — E-series question to add); Admin placing orders on an
MR's behalf (no owner to attribute it to); offline complete/cancel (the LLD keeps them as HTTP).

**Cost:** unit prices are free text from the MR until the client gives a price list.

---

## 2026-09-30 — Monthly stock: due on the month's last day, for Chemists and Distributors

**Decision:** (1) At month end an MR records **opening and closing stock per Product** for each of their
Chemists and Distributors; Admin may enter for any. It is due by the **last calendar day of that month**
(28/29/30/31), not the 5th of the next. `MONTHLY_STOCK_SUBMISSION_DAY` is replaced by
`MONTHLY_STOCK_GRACE_DAYS` (default `0`): extra days after month end, so "the 5th" becomes a config change. (2)
After the deadline an entry is refused (`409`) unless Admin has unlocked that month; a future month is refused. (3)
Missing counts are **reported** to the manager and Admin (`GET /sales/monthly-stock/missing` and a `sales:stock-check`
job), not enforced by a DCR block; notification delivery waits for F8. (4) An MR may enter only for outlets on their
Routes (`canActOnChemist` is added beside `canActOnDistributor`); managers read their team's counts. (5) Stock rides
the daily push as a `MONTHLY_STOCK` record kind; the deadline is checked when the push arrives.

**Why:** the client described the month-end visit and the last-day rule; the LLD's 5th-of-next-month came from the
questionnaire's proposal (§15.4) and was never confirmed. A count taken on the last day would otherwise sit a day
past the deadline. A block would punish the MR for a chemist who was closed; a visible list lets the manager act.

**Rejected:** keeping the 5th (contradicts the client); accept-and-flag (no teeth); blocking the DCR (harsher than
the client's rules ask).

**Cost:** E1 is still a working assumption. The offline caveat: an MR who taps Submit after midnight on the last day
is refused, so the field app should push before the day ends.

---

## 2026-09-29 — The missed-DCR job's rules, and reimbursements in Payroll's total

**Decision:** (1) `DCR_MISS_GRACE_DAYS` is the number of **consecutive missed working days tolerated**: an
employee is blocked once they have missed *more* than that many in a row, ending yesterday. `0` blocks on the
first miss; the default `1` blocks on the second. A day off (weekly off or holiday) and a day covered by an
approved Leave are skipped — they neither count nor break the run; days before the joining date, and before the
day an Admin last cleared a block, are nobody's to report. (2) The job has `--dry-run` and `--user`. (3)
`getPaidTaDaTotal` returns `reimbursementPaise` — the `PAID` manual expenses — beside TA and DA.

**Why:** hld/10's diagram checks only yesterday but its text says "exceeded that count", and a day-by-day block
would fire every Sunday and every holiday; the run-of-working-days reading is the one that is fair and matches
the ERD's wording. Without the clean-slate rule an unblocked employee would be blocked again the next morning
for the same old days. The user asked for reimbursements to reach net pay.

**Consequences:** HR's contract gained `listOffDates`; Identity's gained `listActiveFieldUserIds` and
`getLastBlockClearedAt`. Recorded as sign-off H5/H6 (working assumption until the client answers).

---

## 2026-09-29 — Field Activity's write path, override, TA/DA timing and compliance job

**Decision:** Phase 6 builds Field Activity on these choices (sign-off group H):

- **Records arrive through the sync push, not a POST each.** Calls, follow-ups, expenses, Doctor
  Services, Gifts marked done and the DCR's own submit are sync record kinds; the DCR submit depends on
  every other record of the day. REST stays for reads, the manager's review, Admin's gift and service
  creation, and the Accountant's mark-paid.
- **`FAIL → OVERRIDE` is a manager action on the call**, with a required comment, recorded with who and
  when, separate from approving the DCR, allowed only on a `FAIL` / `UNVERIFIED` call.
- **TA/DA is generated once, at the manager's approval;** if Admin later rejects at the final stage the
  unpaid auto rows are `CANCELLED` and any paid ones are left and reported.
- **The missed-DCR job is a script the operator runs daily by cron**, idempotent through Identity's new
  `blockUser` — no scheduler is added to the application.
- Open client rows (F2 expense limits and receipts, C8 service types, D2 Night Stay, D6 holiday TA/DA,
  B7 attendance) are built around with working assumptions, not guessed at.

**Replaces:** the field-activity LLD's per-record `POST /dcr/:id/...` endpoints and its open note on the
override's shape.

**Why:** the write path follows from the sync design already accepted (one submit, per-record results,
idempotent on the client id) — a second, REST way to create the same records would have to be kept
consistent with it for no gain. The override is per-call so a manager's judgement on one flagged visit
doesn't force a verdict on the day. Generating TA/DA at the manager stage matches HLD 06; cancelling only
*unpaid* rows keeps a payment that has happened out of automatic reversal. A script matches how the
project already runs one-off and periodic operations, and needs no new infrastructure to be reliable.

**Costs:** the phone can't create a call online without a Submit — acceptable, since Submit is the only
commit; Admin's cancellation of unpaid TA/DA needs an audit trail on the expense (`CANCELLED`, with the
reason on the approval history); a missed run of the script means blocks apply a day late, which the
grace already tolerates. Identity gained `blockUser` and a database rule of one open block per user.

**Refs:** [`LLD/field-activity.md`](LLD/field-activity.md), [`client-sign-off.md`](client-sign-off.md) H1–H5,
[`hld/10-submission-gating-and-compliance-block.md`](hld/10-submission-gating-and-compliance-block.md)

---

## 2026-09-29 — Marketing moves up to Tier 5; B9, G1 and G9 confirmed

**Decision:** `marketing` moves from Tier 4 to **Tier 5, beside `payroll`**, so it can read Sales &
Orders' order totals for the Target rollup (`hld/08`) through Sales' public contract. Tier 4 is now
`field-activity` and `sales`; Tier 5 is `marketing` and `payroll`. Also confirmed by the product owner:
the in-day Plan change rules (sign-off B9), and the one-submit sync model with its private draft
backup (G1 as amended by G9) — the client-facing rows are now Accepted, not Designed.

**Why:** the Target rollup needs "achieved" from `OrderItem`, and a same-tier import is forbidden.
Sales depends on nothing in Marketing (an Order carries no Campaign or Target), and Payroll depends
on nothing in Marketing, so lifting Marketing one tier changes one line of `MODULE_TIERS` and no
code. The alternatives — a read model Sales publishes, or a reporting layer above both — would add
machinery to avoid moving one module.

**Costs:** none in code (Marketing isn't built yet). If Sales ever needs something from Marketing
(say an Order tied to a Campaign) the dependency would point the wrong way and the tiers would have
to be revisited; nothing in the ERD asks for that.

**Refs:** [`LLD/marketing.md`](LLD/marketing.md), [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/boundaries-and-enforcement.md`](engineering/boundaries-and-enforcement.md)

---

## 2026-09-29 — The sync push applies records one at a time; the app sends chunks of 100

**Decision:** `POST /sync/push` applies its records sequentially, each in its own transaction with its
receipt, and `SYNC_MAX_BATCH` is 100 (it was drafted as 500). The app sends a larger day in chunks,
parents first and the DCR's own submit last; a dependency on an earlier chunk's record is satisfied by
its receipt. The JSON body limit became 2 MB, and the shared error handler now answers a body over the
limit with a 413 (`PAYLOAD_TOO_LARGE`) and malformed JSON with a 400, instead of a 500.

**Why:** the live run measured about 0.19 s per record against the remote dev cluster, so 500 records
held one request open for 97 s — past any ordinary proxy or phone timeout. Sequential is deliberate: two
calls drawing on one sample allocation must be decided in the order the MR made them, and running
siblings concurrently would make "which one gets the last sample" a coin flip. Chunks of 100 keep a
request near 19 s here and far shorter beside the database.

**Costs:** a day over 100 records is several requests, so the app has to chunk (a small, mechanical rule
in `LLD/sync.md`). Concurrency across genuinely independent records is the escape hatch if a day is ever
too slow — it wasn't built because it changes ordering guarantees. The 413/400 fix also corrects an
older gap: any body-parser error used to be a generic 500.

**Refs:** [`LLD/sync.md`](LLD/sync.md) *Push*, `shared/http/error-handler.ts`

---

## 2026-09-29 — Money migrated to integer paise

**Decision:** `PayBand`'s five money fields and `Route.taPerKmRateOverride` — the only money in the
system so far — moved from `Decimal128` rupees to plain integers in paise, under new names
(`baseSalaryPaise`, `taPerKmRatePaise`, `hqDaPaise`, `exStationDaPaise`, `outStationDaPaise`,
`taPerKmRateOverridePaise`), in storage, domain and API. `shared/money/paise.ts` holds the helpers,
including `multiplyPaise`, which rounds a rate × distance half up to a whole paise once, with exact
integer arithmetic. The request schema and the Mongoose schema both refuse anything that isn't a
whole, non-negative number of paise, so a decimal is a 400, never a silent rounding. Distances stay
`Decimal128` — they aren't money.

**Replaces:** the provisional `Decimal128` choice of 2026-09-23, which the 2026-09-29 entry on
G8 ratified away.

**Why:** paying people from floating-point-adjacent arithmetic is how a payroll drifts by a rupee and
nobody can say why; integers make every sum exact and the one fractional step (TA) explicit, in one
tested place. Doing it now costs one Pay Band and no Routes on the dev database; doing it after
Expenses, Orders and Payroll exist would cost every one of their tables.

**Consequences:** the API's money fields changed name and type, so any client built on the old shape
(there is none yet) would break. A deployed database must be converted before the new version starts
— `scripts/migrate-money-to-paise.ts`, dry run by default, idempotent, backing up before it writes
(`manual_deploy.md`, step 9). Run on the dev database: G1 went from ₹20,000 / ₹5 per km / ₹100 / ₹200 /
₹500 to 2,000,000 / 500 / 10,000 / 20,000 / 50,000 paise, verified, and a second run found nothing
to do. Payroll's flat `base_salary / 30` deduction is also a fractional step, so it rounds half up to
a paise once at generation.

---

## 2026-09-29 — A private draft backup under the daily-report sync (amends G1)

**Decision:** The 2026-09-29 entry above has offline data leave the phone only at the daily report's
Submit. That stands for everything that *counts*, but the phone now also **backs its unsent records up
to the server whenever it has a connection** (sign-off G9), and **Submit ends with the phone taking
the server's version of each record** (G10):

- Drafts go to a holding area as opaque blobs: upserted by `clientId`, last write wins on
  `clientUpdatedAt`, removals remembered. No business rule runs on them, and no other module, report,
  count, balance, gate or compliance check can see them — only the MR, to restore the day on a new
  phone. Submit remains the only commit and runs the real handlers.
- At Submit the server returns its own version of every record (ids, the recomputed geofence status,
  per-record failures), the phone replaces its local copies and refreshes reference data, and the
  day's drafts are deleted with the receipts.

**Replaces:** the "nothing leaves the device until Submit" line of the entry above, and the "save to
server now" button that was listed as deferred.

**Why:** the only real cost of syncing at Submit was that a lost or broken phone loses the day. An
automatic backup removes that without breaking the PRD's rule that nothing counts until Submit, and
without ever making draft data look like real data — which is why it stores blobs and validates
nothing. Reconciling at Submit means the phone never keeps a version that disagrees with the server.

**Costs:** one more collection and two endpoints; drafts hold GPS points and business data, so they
are private to the owner and purged after `SYNC_DRAFT_TTL_DAYS`. If both of an MR's phones edit one
record, the later edit wins. Anything created after the last upload is still lost with the phone.
**The client should confirm G1 as amended** — it said data syncs "only on Submit", and a hidden backup
is a reading of that, not a quote of it.

**Refs:** [`LLD/sync.md`](LLD/sync.md) *Draft backup*, [`client-sign-off.md`](client-sign-off.md) G1, G9, G10

---

## 2026-09-29 — Offline data syncs once, at the daily report's Submit; money is integer paise

**Decision:**

- **One push per day, at Submit (sign-off G1).** The field app sends everything created offline —
  Doctors added, calls with their samples, follow-ups, expenses, orders, gifts done, service
  requests, monthly stock — together, when the MR taps the daily report's Submit with a live
  connection. No background sync. Plans, Leave, approvals and login need a connection at the moment
  of the action. The DCR's own submit is the *last record* of the push and depends on all the others,
  so a day with any failed record isn't submitted; the MR fixes it and taps Submit again, and the
  records already synced are recognised.
- **Pull is a versioned snapshot per source, not a row delta (G2)**, because a delta can't see a
  Doctor appear or vanish when an MR's Routes change.
- **Lateness is judged on the phone's creation time (G3)**, within 10 minutes of the future and 7
  days of the past, both config.
- **Geofence:** radius in SystemConfig (G4); a new `UNVERIFIED` outcome for a Doctor or Chemist with
  no registered location (G5) and for a GPS reading worse than 100 m accuracy (G6); no spoof
  detection (G7).
- **Money is a whole number of paise, everywhere (G8).** No `Decimal128`, no floats.

**Replaces:** HLD 01's "queued records sync whenever connectivity returns"; the provisional
`Decimal128` money choice of 2026-09-23, which this ratifies away rather than confirms.

**Why:** PRD §2 says data syncs "only when the user explicitly hits Submit with an active
connection", and one submit makes the design simpler — no queue state, no retry policy, no
half-synced day. Integer paise makes every sum exact and every amount a value nobody can misread.

**Costs:** nothing leaves the phone until Submit, so a lost or broken phone loses the day (accepted);
a bad connection at 6 pm means retrying the whole submit, which is safe because it's idempotent.
Money needs a migration of `PayBand` and `Route.taPerKmRateOverride` before Phase 6 (roadmap);
TA is a fractional multiplication, so it is rounded half up to a paise once, when created.

**Refs:** [`LLD/sync.md`](LLD/sync.md), [`hld/01-sync-and-geofencing.md`](hld/01-sync-and-geofencing.md),
[`engineering/coding-standards.md`](engineering/coding-standards.md) *Money*, sign-off G1–G8

---

## 2026-09-29 — In-day changes to an approved Daily Plan are their own manager-approved request

**Decision:** Client §2.6 lets the day's plan change during the day with the manager's approval, but
only Admin can reopen an approved request. So a change is **its own record and approval kind**,
`DAILY_PLAN_CHANGE`, and the plan itself is never reopened:

- The employee asks for **today's** plan, while it is `MANAGER_APPROVED` or `APPROVED`, with a
  required reason. The plan stays approved, and its gate open, until the manager decides.
- The manager's approval **is** the decision — the approval module gained `managerOnly` on a kind
  definition, so the kind never has a final stage, whatever `APPROVAL_MANAGER_ONLY_KINDS` says.
- Approving writes the proposed day into the plan in the same transaction, and is refused if the
  plan was reopened, changed since the request, or the day is over.
- One waiting change per plan (partial unique index); at most `DAILY_PLAN_CHANGE_MAX` (3) applied.
- A decided change can't be reopened; Admin reopens the plan instead.

**Replaces:** the LLD's open note that left this "for Phase 4, likely a `DAILY_PLAN_CHANGE` kind".

**Why:** reopening the plan would drop the day's gate and need Admin for what the client wants the
manager to decide; a separate record leaves the approved plan usable and gives the approver a
before/after to look at. `managerOnly` is fixed on the kind, not left to Admin's setting, because
"the manager decides" is this feature's design, not a tuning knob.

**Costs:** the rules (who approves, which days, the cap of 3) are **my assumptions**, recorded as
sign-off B9 with status *Designed*, not answers from the client. A change made on a plan with field
activity already logged is Field Activity's problem to reconcile in Phase 6.

**Refs:** [`LLD/planning.md`](LLD/planning.md) *In-day changes*, [`LLD/approval.md`](LLD/approval.md),
[`client-sign-off.md`](client-sign-off.md) B9

---

## 2026-09-29 — Distributors and sample allocations: two choices

**Decision:**

- **One sample-allocation row per (Doctor, Product); issuing again adds to it.** Not one row per
  issue. The contract's `getSampleAllocation(doctorId, productId)` and the never-negative
  decrement both want a single row to read and to guard. Admin can correct the total, but not
  below what has been given out.
- **A Distributor's primary and secondary sales flags have no default.** Admin states both when
  adding one. Whether a Distributor may take primary or secondary orders is the client's rule, and
  Sales & Orders (Phase 6) will read the flags; a silent default would be a silent assumption.

**Why:** the first keeps the atomic decrement a one-document conditional update (checked live: 30
concurrent gives against 12 in stock, exactly 12 succeeded); the second follows roadmap rule 6 —
don't build on an unstated business rule.

**Consequences:** the per-issue history isn't kept, only the running totals and the last issuer.
If the client wants an audit trail of each issue, it becomes a separate ledger collection beside
the row. Territory's public contract gained `listRouteIdsInScope` so Distributors can be filtered by
Zone, HQ or Area without storing them.

---

## 2026-09-29 — A unique-key conflict inside a transaction is thrown, not returned

**Decision:** Field Master Data's repositories throw `DuplicateRecordError` when a write inside a
transaction hits a unique index (a repeated `clientRequestId`, a second active assignment for a
Doctor); the use case catches it outside the transaction and answers — the earlier Doctor for a
retry, a 409 for a racing assignment.

**Replaces:** the first version of step 4, whose adapter caught the duplicate and returned `null`
from inside the transaction, as Territory's HQ assignment does.

**Why:** the database aborts the whole transaction on any write error. Returning normally after
one meant the commit failed with "transaction aborted", so five racing retries of one create left
one Doctor (correct) but answered 500 to the other four. Found by the step 4 live run.

**Consequences:** rule added to `engineering/coding-standards.md`. Territory's
`MongoUserHqAssignmentAdapter.create` catches the duplicate the same way, so this entry first
suspected the same 500 there. A probe on 2026-09-29 (five simultaneous HQ assignments for one
employee, two different HQs) did **not** reproduce it: all five answered 200 and exactly one
active row remained. It is left as it is; the pattern is still fragile in principle, so it gets
fixed the day someone touches that adapter or a real 500 shows up.

---

## 2026-09-29 — Field Master Data built on today's assumptions (C3, C4, C6, C7, C8)

**Decision:** Phase 4's Field Master Data starts on these accepted assumptions:

- **C3 — a Route change hides an MR's old Doctors, behind a switch.** Visibility follows the MR's
  current Routes: `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` (default `true`). When on, an MR who loses a
  Route stops seeing its Doctors; their assignments are hidden when read, not rewritten, so
  giving the Route back restores them. Admin assigns Doctors on the new Route by hand, and a
  Doctor can only be assigned to an MR who has the Doctor's Route. When off, an MR keeps their
  Doctors across a Route change. Managers see the Routes and Doctors of their downline.
- **C4 / C6 — the MR captures the location; Admin reviews it.** An MR adds a Doctor with their
  phone's GPS location, on one of their own Routes, offline-first: it is saved on the phone and
  sent later under a client-generated id so a retry can't create it twice. Admin can correct the
  location while approving. Admin adding a Doctor directly picks the location on a Google map, and
  that Doctor is active at once. On approval the Doctor is assigned to the MR who added it
  (`AUTO_ASSIGN_DOCTOR_ON_APPROVAL`, default `true`); Admin can reassign later.
- **C7 — `NEW_DOCTOR_COVERAGE_WAIT_DAYS` = 8**, counted from approval. Phase 4 stores the approval
  date; the coverage rule itself waits for Field Activity (Phase 6).
- **C8 — Doctor Service types** aren't needed until Phase 6.
- **Deactivating a Doctor** is refused while it has an active assignment; sample allocations stay
  as history. A Doctor's or Chemist's location may be empty, and an empty one means the geofence
  check can't run.

**Replaces:** the earlier assumption that Admin enters a Doctor's location at creation (C6), and
the open question of whether a Route change moves an MR's Doctors (C3).

**Why:** roadmap rule 6 — build on explicitly accepted assumptions rather than wait on the client.
Route-following is a config switch because it is a policy the client may reverse; hiding on read
means a config flip or a returned Route needs no data repair.

**Costs:** the MR's phone location may not be the clinic's, so Admin's review at approval is the
control. An offline create needs an idempotency id, so the add-Doctor endpoint depends on the same
client-id rule Phase 5's sync will use.

**Refs:** [`client-sign-off.md`](client-sign-off.md) C3, C4, C6, C7, C8,
[`LLD/field-master-data.md`](LLD/field-master-data.md)

---

## 2026-09-28 — HR's design: employee HQ in Territory, lazily seeded balances, a pending ledger

**Decision:** Three choices while planning the HR module:

- **An employee's HQ is a Territory-owned `UserHqAssignment`**, set by Admin or HR. At most one
  active row per FIELD user, with history kept like `RouteAssignment`. HQ- and Zone-scoped
  holidays read it through Territory's contract. An employee without one gets only National
  holidays.
- **Leave balances are seeded lazily, per leave year**, the first time HR needs them (a balance
  read or a leave request). The allocation is the Pay Band's `LeavePolicy` days, pro-rata for
  someone who joined during that leave year. The next leave year seeds itself.
- **`LeaveBalance` keeps `pendingDays` as well as `usedDays`.** Submitting reserves days with a
  conditional update, and the `LEAVE` kind's `onStatusChange` moves them on each decision, in
  the approval module's transaction.

**Why:**
- **HQ:** the Identity ERD pencilled an `hq_id` onto `EmployeeProfile`, but Identity (Tier 1)
  can't validate an HQ that lives in Territory (Tier 2). Territory can validate the user, so the
  assignment lives there. Deriving the HQ from an employee's routes was rejected, because a
  manager with no routes of their own would get only National holidays.
- **Lazy seeding:** "seed when the Pay Band is set" would need Identity to call HR, an upward
  dependency. Seeding on first need also removes any year-end job.
- **Pending ledger:** checking only `usedDays` would let two requests pending at once overdraw a
  balance.

**Refs:** `docs/LLD/hr.md`, `docs/LLD/territory.md`, `docs/erd/02-territory-master.md`, `docs/erd/07-hr-ops.md`

---

## 2026-09-28 — HR built on today's leave assumptions (F3, F11–F16)

**Decision:** The client hasn't answered how leave works in detail. These working assumptions
are accepted so HR can start (roadmap sequencing rule 6). A later client answer is a change, not
a gap, and the marked ones are configuration:

- **F3 — no probation rule.** Leave is allocated once the employee's grade (Pay Band) is set.
- **F11 — the leave year is the financial year**, from `FY_START_MONTH` (April), matching payroll
  and the FY toggle (HLD 09).
- **F12 — the weekly off day and holidays aren't counted** inside a leave range. The off day is a
  new `WEEKLY_OFF_DAY` key (Sunday). Holidays are those that apply to the employee's HQ/Zone plus
  national ones.
- **F13 — a mid-year joiner gets a share** of the grade default for the months left in the leave
  year, rounded to half days.
- **F14 — half-day leave is allowed** (first or second half).
- **F15 — leave can be applied up to 30 days back** (new key), within the current leave year —
  e.g. to cover a missed DCR before the compliance block (PRD §7.5).
- **F16 — too little balance is refused.** Loss of Pay has no balance and is always allowed.

The client's own leave types, which are paid, and the days per grade (F17) are data HR enters in
the app, so they don't block building.

**Why:** HR has no technical blocker; these are the rules the LLD left unstated. Deciding them now
keeps them out of ad-hoc code decisions.

**Refs:** `docs/client-sign-off.md` §F, `docs/LLD/hr.md`, `docs/hld/09-financial-year-toggle.md`

---

## 2026-09-28 — A rejected Plan gets a short window to be resubmitted

**Decision:** Adds to the late-Plan rule below. After a **rejection**, the employee may resubmit
past the deadline until the later of the deadline and the rejection time plus a grace period. Two
limits apply, whichever is reached first:

- **Daily Plan:** grace `DAILY_PLAN_RESUBMIT_GRACE_MINUTES` (30), never after
  `DAILY_PLAN_RESUBMIT_LATEST_TIME` (11:30) on the plan's date.
- **Monthly Plan:** grace `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` (24), never after the month has
  started.
- **Both:** at most `PLAN_RESUBMIT_GRACE_MAX` (2) resubmits through the window per Plan.

A rejection before the deadline gets the same window (09:50 → 10:20). The window follows a
rejection only, not the employee's own withdraw (which would let them buy time) and not an Admin
reopen. Once the window is closed or used up, the late-submission exception still applies. A
submit inside the window never uses an exception. All four values are SystemConfig.

**Why:** with every submit checked, a manager rejecting at 10:30 cost the MR the day unless
someone granted an exception. Telling managers to "reject early" isn't a rule anyone can enforce.
The count stops endless reject-and-resubmit rounds, and the time cap keeps the field day usable.

**Consequences:** Plans carry a `lateResubmits` count, raised in the submit transaction. Plan
views show `resubmitAllowedUntil` while a window is open. Existing environments need a re-seed for
the four new keys.

**Refs:** `docs/LLD/planning.md`, `docs/client-sign-off.md` B8

---

## 2026-09-28 — A late Plan is refused; a one-off exception overrides the deadline

**Decision:** A Daily or Monthly Plan submitted after its deadline is **refused** (`409
PLAN_SUBMIT_LATE`), not accepted and flagged. Every submit is checked, including a resubmit after
a rejection or withdrawal. The override is a **late-submission exception** (`LatePlanSubmitGrant`)
for one user and one Plan (a date or a month):

- **Admin** can grant it to anyone. A **manager** can grant it to someone in their downline only
  while `LATE_PLAN_GRANT_BY_MANAGER` is `true` (seeded `false`).
- A reason is required. It expires `LATE_PLAN_GRANT_VALID_HOURS` after it's granted (seeded `24`),
  covers **one** submit (used up in the same transaction as the submit) and can be revoked while
  unused.
- The employee still submits the Plan and it goes through normal approval. Nobody submits on the
  employee's behalf.
- Deadlines are read in `BUSINESS_TIMEZONE` (seeded `Asia/Kolkata`). A Daily Plan is due at
  `DAILY_PLAN_SUBMIT_CUTOFF_TIME` on its own date. A Monthly Plan is due at the end of
  `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` in the month before; a day past that month's end (e.g. 30 in
  February) means its last day.

**Why:** B4 already blocks the DCR until the Plan is approved, so a "late" flag that changed
nothing would be a deadline in name only. Lifting a rule is Admin's everywhere else too (B6
unblock, E2 stock reopen, F10 reopen). The manager switch exists because an Admin-only exception
could make Admin the 10:05 bottleneck for the whole org, and turning it on needs no code change.

**Rejected:** accept-and-flag (no teeth); applying the deadline to the first submit only (the
user chose every submit, so resubmits get no special rule); requesting an exception through a new
approval kind (two approval rounds for one day's Plan).

**Consequences:** a manager who rejects a Plan after the cutoff leaves the MR needing an
exception before they can resubmit, so rejecting early matters. Existing environments need
`pnpm --filter @greynote/api seed` to get the three new keys. Recorded as sign-off row B8.

**Refs:** `docs/LLD/planning.md`, `docs/erd/05-planning-and-rules.md`, `docs/client-sign-off.md` §B

---

## 2026-09-28 — Plan deadlines and the DCR gate built on today's assumptions (B1, B3, B4)

**Decision:** The client hasn't answered sign-off rows B1, B3 and B4. Their "Today" assumptions
are accepted explicitly, so Phase 4 Planning can start (roadmap sequencing rule 6):

- **B1 — Monthly Plan deadline: the 28th.** Read from `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE`, i.e. next
  month's plan is due by the 28th of the current month.
- **B3 — Daily Plan deadline: 10:00.** Read from `DAILY_PLAN_SUBMIT_CUTOFF_TIME`.
- **B4 — a missed Daily Plan blocks that day's DCR**, not just a notification. The gate opens once
  the day's `DAILY_PLAN` request is past the manager: `MANAGER_APPROVED` or `APPROVED`
  (Planning's `isDailyPlanApproved`, `LLD/planning.md`).

**The values are configuration, not code.** Both deadlines are already-seeded `SystemConfig` keys
that Admin can change at runtime (decision-log 2026-09-24); Planning reads them through
Config's `get(key)` on every submit and never hardcodes `10:00` or `28`. A client answer that
only changes a value is an Admin edit, not a release. B4 is a rule, not a value, and has no key.

**Why:** Planning is the approval module's first consumer and on the path to Phase 6's gate;
waiting on the client would stall both. These three are the rows Planning actually depends on.

**Consequences:**

- A **business timezone** is needed to say when "10:00" and "the 28th" are — the server has none
  (decision-log 2026-09-28, approval date filters). Planning adds it as a `SystemConfig` key
  (e.g. `BUSINESS_TIMEZONE`, default `Asia/Kolkata`), not an env var, when it builds the cutoffs.
- **Still undecided, and needed before Planning's submit use cases:** what happens to a Plan
  submitted after its deadline — refused, or accepted and flagged (`LLD/planning.md` write-path
  rules). Not covered by B1/B3.
- B2 (missed Monthly Plan blocks next month's DCR), B5–B7 stay as they are — they gate Phase 6,
  not Planning. Field Master Data (C) and HR (F) rows are unchanged.

**Refs:** `docs/client-sign-off.md` §B, `docs/roadmap.md` sign-off gate,
`apps/api/src/modules/config/application/usecases/seedDefaultConfig.usecase.ts`

---

## 2026-09-28 — Approvals are decided on a cycle; bulk isolates faults; date filters carry an offset

**Decision:** Three fixes from the Phase 3 review, before Planning becomes the first consumer:

- **A decision names the cycle it was made on.** `POST /approvals/:id/approve|reject` require
  `cycle`; `POST /approvals/bulk` takes `requests: [{ id, cycle }]` instead of `requestIds`. The
  conditional write matches status **and** cycle. Replaces the status-only guard.
- **Bulk never fails as a whole.** An unexpected error on one item (an unregistered kind, an
  owning module's `onStatusChange` throwing a plain `Error`) is logged at `error` and returned as
  that item's `500`; the other items still run. Previously it aborted the loop with a bare `500`
  after earlier items had already committed.
- **List `from` / `to` must be ISO date-times with an offset**, both inclusive. A bare date is a
  `400`. Replaces `z.coerce.date()`, which read `to=2026-09-28` as 00:00 UTC — dropping that day,
  and off by 5½ hours for IST.

**Why:** Withdraw + resubmit returns a request to `SUBMITTED` on a new cycle with a possibly
edited record, so a status-only guard let a manager approve content they never saw. The server
has no business timezone, so it cannot turn a bare date into a day; the client can.

**Consequences:** web and mobile clients send the `cycle` from the row they displayed, and send
local start/end-of-day instants. A business-timezone `SystemConfig` key is still needed for
Planning's 10:00 Daily Plan deadline (B3) — added in Phase 4, not here. No client existed yet,
so the contract change cost nothing.

**Refs:** `apps/api/src/modules/approval/`, `docs/LLD/approval.md`, `docs/hld/05-approval-workflow-engine.md` §8

---

## 2026-09-24 — Approval workflow switch is one list key; decision callbacks are transactional

**Decision:** Two refinements while building Phase 3 step 3:

- **One config key, not one per kind.** `APPROVAL_MANAGER_ONLY_KINDS` (seeded `NONE`) lists the
  kinds that end at the manager; every other kind is Manager → final. The planned per-kind
  setting (and a per-kind `defaultWorkflow` on registration) is dropped. Read at each
  (re)submission and snapshotted onto the request, so a change applies from the next cycle.
- **`onStatusChange` runs inside the same MongoDB transaction** as the status change it reports
  (decide, withdraw, reopen). The owning module writes through the passed context; if it
  throws, the approval change rolls back too. Submit/resubmit accept an optional context the
  other way round, so an owning module can save its record and submit in one transaction.
  `TransactionRunnerPort` / `TransactionContext` and the Mongoose runner move from Identity to
  `src/shared/db/` so a transaction can span modules.

**Why:** Kinds are registered at runtime by owning modules, but `SystemConfig` only lets Admin
edit keys that were seeded — a key per kind would have to be seeded before its kind exists. And
an after-commit callback could leave the approval saying "approved" while, say, the leave
balance was never deducted; one transaction makes that impossible.

**Consequences:** handlers must keep to database writes on the context (a transient-error retry
can run them twice); notifications go elsewhere (F8). Owning modules should read status from the
approval module (`getForRecord`) rather than keep their own copy.

**Refs:** `apps/api/src/modules/approval/application/applyTransition.ts`,
`apps/api/src/shared/db/`, `apps/api/src/modules/config/application/usecases/seedDefaultConfig.usecase.ts`

---

## 2026-09-24 — An Admin override at Stage 1 is a final approval

**Decision:** When Admin approves a request still waiting on the submitter's manager
(`SUBMITTED`), it goes straight to `APPROVED`, recorded with authority `ADMIN_OVERRIDE`.
**Reverses** HLD 05 §5, where the override applied only the Stage-1 transition (`SUBMITTED →
MANAGER_APPROVED`). A top-of-chain request (no manager) likewise ends in one step at the final
approver (`TOP_OF_CHAIN`), as PRD §7.1.4 already said. Only the manager's own approval stops at
`MANAGER_APPROVED` (and only when the kind's workflow has a final stage).

**Why:** Admin is the final authority on every kind. Under the old rule Admin would approve the
same request twice in a row — a second click, not a second check.

**Consequences:** HR gets no Stage-1 override, even on Leave — HR acts at the final stage, or
directly only when the submitter has no manager. The history's `authority` field always shows
which path a decision took.

**Refs:** `apps/api/src/modules/approval/domain/approvalRules.ts`, `docs/hld/05-approval-workflow-engine.md` §5

---

## 2026-09-24 — Phase 3: the approval engine becomes a module; Admin is a real second stage

**Decision:** Agreed with the product owner before building Phase 3, after reading the client's
`RULES BY GREYNOTE.docx` §19 against HLD 05:

- **An `approval` module (tier 2), not a shared library.** Reverses HLD 05 §1 and the roadmap's
  "not a module, not a tier". It owns an `ApprovalRequest` collection: kind, the owning module's
  record id, submitter, current stage/status, and a full action history (who, when, comment). The
  owning module (Planning, HR, …) creates the request and is called back on each decision through
  a handler registered at the composition root, so the lower tier never imports the higher one.
- **Stage 2 is a real approval, not record-keeping.** Status runs `SUBMITTED →
  MANAGER_APPROVED → APPROVED`, with `REJECTED` possible at either stage (client §19.3:
  "first immediate manager & then Admin"). Each owning module decides which status unlocks what
  for it (e.g. HLD 10's DCR gate needs only a Manager-approved Plan).
- **Per-kind workflow in `SystemConfig`**: `MANAGER_THEN_FINAL` (default) or `MANAGER_ONLY`, so
  the client can drop the second stage for high-volume kinds (e.g. Daily Plans) without a
  release — and the still-open F1 list doesn't block the build. Who may act at the final stage is
  fixed per kind in code: **ADMIN**, or **HR or ADMIN for Leave**.
- **Leave goes Employee → Manager → HR/Admin** (product owner, matching client §11.2). Reverses
  PRD §5.3 / `LLD/hr.md`'s "HR approves directly, bypassing the manager chain" — Leave now uses
  the engine like everything else.
- **Doctor creation goes Employee → Manager → Admin** (product owner; client §4.2, sign-off C4).
- **Approved means locked for the employee; Admin can override.** Once `APPROVED` (or
  `MANAGER_APPROVED` on its way there) the submitter can't edit or withdraw. Admin can reopen an
  approved request (reason required, history kept), and each owning module lets Admin edit its
  own approved records.
- **The approver is resolved when someone acts, from the submitter's *current* manager** — not
  snapshotted at submission — so a reassigned employee's pending items move to the new manager.
  Admin's standing Stage-1 override (entry below, 2026-09-23) still covers an inactive/absent
  manager. Needs Identity `getDirectReports` / `getDownline` (the Team tab needs them anyway).
- **Engine-wide rules:** a rejection needs a reason; the submitter can withdraw until the
  manager acts (client §11.4); a rejected request can be resubmitted as a new cycle on the same
  request, history kept; nobody approves their own request; managers and Admin can bulk-approve;
  decisions emit an event where notifications will plug in (F8 still open).

**Why:** the client wants one common approval screen (§19.6) across many kinds (§19.3: DCR,
Expense, Leave, Doctor Service, Doctor Creation/Location, Sample, Gift, Order, change requests).
A library leaves each kind's status in its own collection, so that screen and Admin's org-wide
queue (HLD 05 §5) would have to query and merge every module's collection; a module with one
collection answers both with one query and gives a uniform audit trail.

**Consequences:**
- HLD 05, `LLD/hr.md` (leave approval), the roadmap's Phase 3/4 text and the PRD §5.3 leave
  wording are superseded; HLD 05 is rewritten as part of the Phase 3 build.
- `.dependency-cruiser.cjs` `MODULE_TIERS` gains `approval` in tier 2 beside `territory`.
- Reopening an approved request must later respect a Finalized PayrollRun (Phase 7): a month
  already paid stays locked.

**Refs:** `docs/hld/05-approval-workflow-engine.md`, `docs/LLD/hr.md`, `docs/roadmap.md`,
`docs/client-sign-off.md` C4/F1/F9, client `RULES BY GREYNOTE.docx` §4.2, §11.2, §11.4, §19

---

## 2026-09-24 — Phase 2 (Territory) build decisions

**Decision:** Agreed with the product owner before building Territory:

- **Google Maps** (Places API (New) for search, Routes API for distance — the legacy Places /
  Directions APIs can't be enabled on new projects), behind `PlaceSearch` /
  `DistanceProvider` ports so a cheaper provider (Ola Maps, OSRM) is one adapter away. Tests use a
  fake adapter. Directions caps a request at 25 waypoints, so a Route accepts at most 25
  (origin + destination + 23 via).
- **The API proxies place search**: `GET /api/territory/places/search?q=`. The Google key never
  leaves the server, and waypoint entry is testable from Swagger before the web portal exists.
- **Distance is calculated during the save**, with a timeout (~5 s). Failure saves the Route as
  `FAILED`; Admin retries with `POST /api/territory/routes/:id/recalculate`. `PENDING` is dropped
  from `distance_status`: nothing runs in the background, so nothing is ever pending. A
  `revision` counter, bumped by every waypoint/distance write, makes concurrent edits safe (a
  stale revision is rejected, not silently overwritten). *(Planned as `waypointsVersion`; widened
  while building so a slow recalculation can't overwrite a manual override made meanwhile.)*
- **`distance_km` is used as-is for TA — no ×2 for the return trip.** Admin defines the route (or
  overrides the distance) to cover the full travel the company pays for.
- **Names are unique within their parent**, case-insensitive (Zone globally, HQ per Zone, Area
  per HQ, Route per Area). **Nothing is hard-deleted**: a Zone/HQ/Area can't be deactivated while
  it has active children, and a Route can't be deactivated while it has active assignments.
- **CSV bulk import for Zone / HQ / Area** (not Routes — each waypoint needs a confirmed map pin).
- **Client sign-off D5 answered: a Route always uses its Area's type.** No per-Route override.

**Why:** these were the points the LLD/HLD left open or contradicted (HLD 02 describes a blocking
call yet the ERD had a `PENDING` status; the LLD had no edit/deactivate endpoints and no retry for
a failed calculation). Round-trip handling was raised because TA money depends on it; the owner
chose to keep it an Admin data-entry concern rather than a rule in code.

**Consequences:**
- Admin must remember the no-×2 rule when entering or overriding distances; the system won't
  catch a one-way figure for a round-trip route.
- A `GOOGLE_MAPS_API_KEY` is needed in every environment that creates or edits Routes; without it
  routes still save, as `FAILED`.

**Refs:** `docs/LLD/territory.md`, `docs/hld/02-route-distance-calculation.md`,
`docs/erd/02-territory-master.md`, `docs/client-sign-off.md` D5

---

## 2026-09-24 — Field devices need Admin approval; Admin device actions and password reset

**Decision:** The client answered sign-off group A: password login for now, 2 devices for field
employees, Admin approval for new devices, Admin can remove / log out a device, no limit for
Admin/HR/Accountant, Admin-only password reset. **Reverses** the Phase 1 device rule ("count
active sessions; at the limit, block with 'log out from another device first'"):

- New `UserDevice` registry (FIELD only). **Every** new phone, the first included, becomes a
  `PENDING` request and can't log in until Admin approves it.
- `MAX_REGISTERED_DEVICES_FIELD` (replaces `MAX_ACTIVE_DEVICES_FIELD`, default `2`) counts
  pending + registered phones. At the limit a new phone is refused and **no** request is
  created; Admin must remove an old phone first. Logging out never frees a slot.
- A rejected phone is blocked for `REJECTED_DEVICE_TTL_DAYS` (default `7`); a MongoDB TTL index
  then deletes the rejection and the phone counts as new.
- `UserSession.revokedReason`: only reuse of a `ROTATED` refresh token counts as theft.
- Admin-only endpoints: pending queue, per-employee device list, approve, reject, remove, log out
  one phone, reset password.

**Why:** the client's rules (§20.3) want new devices controlled by Admin. Counting sessions let
an employee swap phones freely just by logging out. The revocation reason is needed because
without it, the first background refresh from a phone Admin removed would have been treated as
theft and logged the employee out of their other, legitimate phone.

**Consequences:**
- Existing field users (none in dev) would need their phones approved once after deploy.
- Two new phones logging in at the same instant could both pass the limit check before either
  request is written (limit + 1 pending). Not guarded; Admin simply rejects the extra one.
- The Android app must send `ANDROID_ID` etc. in the login body — documented in
  `LLD/identity.md` "Where `device_id` and `device_name` come from".

**Refs:** `apps/api/src/modules/identity/{domain/userDevice.entity,application/usecases/login.usecase,interface/devices.route}.ts`,
`docs/hld/04-authentication-and-sessions.md`, `docs/LLD/identity.md`, `docs/client-sign-off.md` A

---

## 2026-09-24 — `PayBand.daAmount` split into `hqDa` / `exStationDa` / `outStationDa`

**Decision:** Closes the code mismatch flagged in the entry below. `PayBand` now stores three DA
rates, one per `Area.type`, all `Decimal128` and all required on create. `daAmount` is removed
outright, not kept as an alias.

**Why:** Phase 6's DA calculation (HLD-06 §2) needs a rate per Area type, and the mismatch was
cheapest to fix now, while only Admin master data depends on `PayBand`.

**Consequences:** existing `PayBand` rows that only have `daAmount` can't be read by the new
adapter and need the three fields backfilled. Night Stay is still not a field, because its
trigger is still undefined.

**Refs:** `apps/api/src/modules/identity/{domain/payBand.entity,infrastructure/payBand.schema,infrastructure/mongoPayBand.adapter}.ts`

---

## 2026-09-24 — Territory, Distributor, Doctor assignment and DA re-aligned to the client's Master spec

**Decision:** **Reverses** four earlier design calls. None had a decision-log entry of its own;
each lived as a "locked" bullet in an ERD/LLD doc:

- **`Area` added: `Zone → HQ → Area → Route`.** Reverses ERD-02's "Three-level hierarchy, no
  Area" and `LLD/territory.md`'s "Area... considered and dropped". `Route.hq_id` becomes
  `Route.area_id`. `Area` carries `type: HQ | EX_STATION | OUT_STATION`.
- **DA is per Area type, not flat.** Reverses HLD-06's `da_amount = pay_band.da_amount`. Each
  grade has `hq_da`/`ex_station_da`/`out_station_da`, and a day's DA uses the rate for its routes'
  Area type (highest type wins if mixed; `MEETING`/`CONFERENCE` default to HQ — both provisional,
  see HLD-06 §2).
- **Distributor attaches to a Route, not an HQ.** Reverses ERD-03's "Distributor attaches at the
  HQ level". Also gains `latitude`/`longitude` (reversing "Distributor doesn't get this"),
  `gst_number`, `contact_person`, `mobile`, single-value `assigned_mr_id`/`assigned_asm_id`, and
  primary/secondary-sales flags. An MR can act on a Distributor if it's their `assigned_mr_id` or
  their `RouteAssignment` covers its Route. This resolves `LLD/sales-and-orders.md`'s open
  "territory gating on Order creation" question.
- **One active `DoctorAssignment` per Doctor.** Reverses ERD-03's "a doctor can have more than
  one MR assigned". The table stays, as history plus a partial unique index on active rows.
  Managers reach the doctor through the reporting chain, not extra rows.

Also added: `SystemConfig.MONTHLY_STOCK_SUBMISSION_DAY` (seed default `5`) as the Admin-set
cut-off for monthly Distributor stock entry.

Considered and **rejected** on the way: an `AreaAssignment` (MR↔Area) and `DistributorArea` join
to gate Distributor access by Area. The client spec gates by Route + a direct assigned MR, so a
second assignment mechanism would duplicate `RouteAssignment`. Also rejected: scoping each
manager designation to a territory level (ASM→Area, ZSM→Zone, NSM→national). Client rules §18
define manager visibility purely by reporting chain, which `getDownline` already does. Orgs
missing a level (no ZSM/NSM) are already covered by HLD-05 §2/§5's Admin fallback.

**Why:** the ERD/LLD were first written from the PRD alone. The client's own Master spec
(`MASTER V2.docx` M1/M2/M4/M6, `RULES BY GREYNOTE.docx` §8/§14–18/§31, `sales.docx` S6) is more
specific and disagreed on each point. The one-doctor-one-MR rule was answered directly by the
product owner in this discussion, not taken from the spec, where it's still an open question.

**Consequences:**
- **Code mismatch, not fixed yet:** `PayBand` (Identity, Phase 1, shipped) has one flat
  `daAmount`. It must become three per-area-type rates (plus Night Stay once its trigger is
  defined) before Phase 6 builds DA. The 2026-09-23 "`Decimal128`, provisional" entry already
  flagged `PayBand`'s money fields as revisable; this adds a concrete reason.
- Territory and Field Master Data aren't code yet, so their reshaping costs nothing now.
- Still open with the client, left unresolved in the docs rather than guessed: Night Stay DA
  trigger, holiday/weekly-off effect on DA, the mixed-area-type tie-break, whether a Route can
  override its Area's type, and approval-based re-open of a closed stock month.

**Refs:** `docs/erd/02-territory-master.md`, `docs/LLD/territory.md`,
`docs/erd/03-field-master-data.md`, `docs/LLD/field-master-data.md`,
`docs/hld/06-ta-da-auto-calculation.md`, `docs/LLD/sales-and-orders.md`,
`apps/api/src/modules/identity/domain/payBand.entity.ts`

---

## 2026-09-24 — `SystemConfig` gets an Admin write path; Admin gets blanket Stage-1 approval override

**Decision:** Two additions to the not-yet-built Planning/Approval design, both scoped ahead of
that module's implementation so neither gets built the old way first:

- **`SystemConfig` (Module 5, `hld/03` §3) gains an Admin-facing write path.** Today it only has a
  seed step and a read-only `getConfigValue` use case — nothing lets Admin actually change
  `DCR_MISS_GRACE_DAYS` from its default of `1` to `2` or `3`. A `PATCH` on a config key, ADMIN-only,
  closes that gap. No schema change — `SystemConfig.value` was already a plain string.
- **Admin gains a blanket override on Stage-1 approval** (`hld/05`), not just the existing
  `manager_id IS NULL` case. Any `SUBMITTED` record — Daily Plan, Monthly Plan, DCR — can be
  approved or rejected directly by any ADMIN-role user, regardless of who the nearest manager is
  or whether that manager can currently act.

**Why:** the second decision is the direct answer to "what happens when the nearest manager can't
approve" — resigned/deactivated, on leave, forgot, or simply unreachable. Detecting *which* of
those applies would mean new state on `User`/`EmployeeProfile` (an unavailability flag, a delegate
field, leave-calendar integration) and separate handling per case. A blanket, always-on Admin
override needs none of that: it's the same one mechanism regardless of reason, and it's already
consistent with `hld/05` §4's existing principle that Admin visibility is role-based, not
hierarchy-based — this just extends that principle one stage earlier, from read access on
`MANAGER_APPROVED` records to approve/reject action on `SUBMITTED` ones. The config write path is
bundled into the same entry because it's what makes the first, already-designed rule
(`DCR_MISS_GRACE_DAYS`) actually operable instead of a seed-only default.

**Consequences:**
- `hld/05` gains a `§5 Admin override` section; `LLD/planning.md`'s HTTP surface table gains
  `GET /admin/approvals/pending` (org-wide, filterable by `managerId` and date range — reusing
  `EmployeeProfileRepositoryPort.findUserIdsByFilter`, defined but unused today) and
  `POST /admin/approvals/:id/approve` / `/reject`.
- No new field on `DailyPlan`/`MonthlyPlan`/`DCR` to flag "admin override" — `reviewed_by` already
  points at whichever `User` acted, and that user's `roleId` being `ADMIN` is itself the signal.
  Revisit only if a future report needs to isolate overrides without that join.
- Documentation-only for now — Planning/Approval isn't code yet (only `config`, `health`,
  `identity` are real modules under `apps/api/src/modules/`). Recorded ahead of that build so it
  isn't designed without either rule.

**Refs:** `docs/hld/05-approval-workflow-engine.md` §5, `docs/hld/10-submission-gating-and-compliance-block.md` §2,
`docs/erd/05-planning-and-rules.md`, `docs/LLD/planning.md`

---

## 2026-09-23 — `Route.ta_per_km_rate_override`: a per-route default override for TA

**Decision:** `Route` (Territory, Module 2 — not yet built) gains an optional
`ta_per_km_rate_override: decimal, nullable` field. `PayBand.ta_per_km_rate` (Module 1) remains
the default; when a route has this set, it takes precedence for travel on that specific route.
TA/DA auto-calculation (`hld/06` §2) resolves the rate **per route**, not once for the whole day —
`ta_amount = sum over routes where CALCULATED of distance_km × (ta_per_km_rate_override ??
pay_band.ta_per_km_rate)` — since a `DailyPlan` can carry multiple routes, each potentially with
its own override. Unlike `Route.distance_km`'s `MANUAL_OVERRIDE`, this does **not** reset on a
waypoint edit (it's a negotiated fact, unrelated to geography) and needs no `_source`/`_status`
provenance pair — it's simply present or absent.

**Why:** lets Admin set a higher rate for a specific remote/difficult route without creating a
whole new `PayBand` grade just for it, matching how real per-km reimbursement negotiations
actually work.

**Consequences:** documentation-only for now — `Territory`/`Route` isn't code yet (roadmap Phase
2), and TA/DA calculation is Phase 6. Recorded ahead of both landing so neither implements the
old single-rate-per-day formula.

**Refs:** `docs/erd/02-territory-master.md`, `docs/hld/06-ta-da-auto-calculation.md` §2

---

## 2026-09-23 — Split `User` into a lean account + `EmployeeProfile`/`ComplianceBlock`

**Decision:** **Reverses** (per this log's append-only rule, the two entries below stay as
history, not edited) both the "Identity's `User` gains onboarding fields..." entry and the
"compliance block history embedded on `User`" direction from earlier the same day. `User` shrinks
to a lean account/org-identity record for every role: `employeeCode`, `name`, `email`, `phone`,
`status`, `roleId`, `passwordHash`, `lastLoginAt`, `isBlocked`. Two new collections take
everything else:

- **`EmployeeProfile`** — FIELD-only, one per `User`, created **lazily** on the first onboarding
  `PATCH` (not at `User` creation — `POST /users` never touches it). Holds
  `designationId`/`payBandId`/`managerId`/`dateOfJoining` (moved off `User` — all four were
  already FIELD-only in practice) plus the personal/bank/document onboarding bundle from the
  earlier entry.
- **`ComplianceBlock`** — one document per block **event**, not a single overwritable set of
  fields — a second block later in an employee's tenure no longer erases the first one's reason
  and timestamps. `User.isBlocked` stays as a fast top-level flag; the row is where the detail
  lives. Retention is **indefinite** — no TTL — matching how the rest of the system treats
  history (`hld/09`'s FY toggle only ever scopes what's shown, never deletes).

**Why:** `User` had accumulated a pile of fields that are always null for 3 of the 4 roles
(`ADMIN`/`HR`/`ACCOUNTANT` never touch onboarding data), and compliance-block history is
open-ended over an employee's whole career — both are exactly the kind of data worth separating
from an auth-critical record (`passwordHash`, `roleId`) before real data exists, the same
"decide before it's expensive to change" reasoning as the `Decimal128` money decision. Discussed
and confirmed along the way: dangling references aren't a new risk this split introduces —
nothing in this system is ever hard-deleted (`Role`/`Designation`/`PayBand` have no `DELETE`
endpoint, `User` is soft-deactivated, `UserSession` is soft-revoked) — and the two places
stale-value drift actually matters financially (`PayrollRun.base_salary`, generated TA/DA
`Expense` amounts) already have their own documented locked-snapshot rule, unaffected by this.

**Consequences:**
- `CreateUserInput` simplifies to one shape for every role
  (`{role, employeeCode, name, password, email?, phone?}`) — `designationId`/`payBandId`/
  `managerId` are no longer accepted at creation, only via the onboarding `PATCH`. `createUser`
  goes back to a single-collection write.
- `unblockUser` now writes to two collections (close the open `ComplianceBlock`, flip
  `User.isBlocked`) and does so inside **this codebase's first MongoDB transaction**
  (`TransactionRunnerPort`/`MongooseTransactionRunner`) — every other write in this system remains
  a single-document update, which MongoDB already makes atomic on its own.
- `listUsers`'s designation/manager filters and `UserSummary`'s designation/manager fields now
  require resolving `EmployeeProfile` — handled as a two-phase query (resolve matching `userId`s
  from `EmployeeProfile` first, then filter `User` by `_id`), not a `$lookup` aggregation —
  simpler to reason about and sufficient for this filter's low, Admin-driven query volume.
- A new `GET /api/identity/users/:id` endpoint exists now, since `UserSummary` never carried
  personal/bank details and nothing else exposed a user's full onboarding profile.
- `docs/erd/01-identity-hierarchy.md` and `docs/LLD/identity.md` are rewritten to describe the new
  shape rather than the one from earlier today.

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,employeeProfile.entity,complianceBlock.entity,transactionRunner.port}.ts`,
`apps/api/src/modules/identity/application/usecases/{createUser,updateUser,unblockUser}.usecase.ts`

---

## 2026-09-23 — Bootstrap Admin via an interactive seed script, not env vars

**Decision:** **Reverses** the "Bootstrap Admin seeded from env vars, exactly once" entry below,
from the same day. `BOOTSTRAP_ADMIN_EMPLOYEE_CODE`/`_NAME`/`_EMAIL`/`_PHONE`/`_PASSWORD` are
removed from `env.ts`'s schema entirely. In their place, `apps/api/src/scripts/seed.ts` — a
second composition root alongside `container.ts`, exactly the shape
`docs/engineering/module-anatomy.md` anticipated for "a worker process, a script" — seeds
`SystemConfig` defaults and the 4 fixed `Role` rows, then, only if no `ADMIN` user exists yet,
**interactively prompts** an operator for the first Admin's details (password entry masked, typed
twice) rather than reading them from environment configuration. Run via `pnpm --filter
@greynote/api seed` in dev, or `node dist/scripts/seed.js` inside the running container in prod
(`docker compose exec`). `buildContainers()` in `container.ts` no longer calls any seed method —
server boot does zero DB writes as a side effect of starting.

**Why:** the env-var approach meant a plaintext admin password had to sit in `apps/api/.env.prod`
for the entire life of a deployment, readable by anything with host/container access, long after
it served its one purpose. It also meant every server process did DB write queries on boot as an
implicit side effect of starting up. Neither is a correctness bug — the seeding itself was
already idempotent (`$setOnInsert` for Config, existence-checks for Role and the bootstrap Admin),
so a restart never clobbered an Admin's edits — but "seed the database" deserves to be an
explicit, operator-triggered action, the same way a schema migration is, not invisible behavior
baked into `npm start`.

**Consequences:** `apps/api/.env.example` and `.env.prod.example` lose the `BOOTSTRAP_ADMIN_*`
block. A fresh environment (dev or prod) needs one manual `pnpm --filter @greynote/api seed` /
`node dist/scripts/seed.js` run before the first login attempt — documented in
`setup-development.md` and `manual_deploy.md`. `esbuild.config.mjs` gained a second entry point
(`src/scripts/seed.ts` → `dist/scripts/seed.js`) so the script ships in the prod image alongside
`dist/server.js`. New runtime dependency: `prompts` (masked password input) — a real
`dependencies` entry, not `devDependencies`, since the script must run from the prod image's
`pnpm deploy --prod` node_modules, not just via `tsx` in dev.

**Refs:** `apps/api/src/scripts/seed.ts`, `apps/api/src/container.ts`,
`apps/api/src/modules/identity/identity.container.ts`,
`docs/engineering/module-anatomy.md`

---

## 2026-09-23 — Identity's `User` gains onboarding fields, a `pending` status, and defers Zone/HQ

**Decision:** `User` (ERD Module 1) grows beyond `docs/erd/01-identity-hierarchy.md`'s original
field list to support a step-by-step Admin onboarding flow for FIELD employees: personal details
(`mobile_number`, `guardian_name`, `date_of_birth`, `address`, `qualification`), bank details
(`bank_name`, `ifsc`, `account_number`, `account_holder_name`, `branch_name`), and an array of
uploaded documents. `status` widens from `active/inactive` to `active/pending/inactive` —
`pending` means onboarding incomplete, kept distinct from `inactive` (deactivated/offboarded) so a
future Payroll query for "active FIELD employees" can't accidentally include someone
mid-onboarding. `status` is auto-computed (not a separate "activate" action) every time
`PATCH /api/identity/users/:id` changes one of the required-for-activation fields — see
`domain/onboarding.ts`'s `computeUserStatus`, which never upgrades an already-`inactive` user back
to `active`/`pending` as a side effect. Zone→HQ is deliberately **not** added here — Territory
(Phase 2, one tier above Identity) doesn't exist yet, and ERD-01's own "Next" section already
planned for that FK to land with Module 2, not Module 1.

**Why:** the PRD/ERD didn't originally specify these fields, but real Admin onboarding needs them,
and a FIELD employee shouldn't be usable (assignable, able to submit) until the record is actually
complete. Auto-computing status (rather than a manual activate call) means every onboarding PATCH
naturally converges on `active` the moment the last required field lands.

**Consequences:** `docs/erd/01-identity-hierarchy.md` needs its `User` entity and `status` field
updated to match this. `docs/LLD/identity.md`'s HTTP surface table gains
`POST /users/:id/documents` and `DELETE /users/:id/documents/:documentId`, and its create-user
row should note the discriminated payload shape (decision below).

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,onboarding}.ts`

---

## 2026-09-23 — One `POST /api/identity/users`, discriminated by role

**Decision:** the LLD's single `POST /api/identity/users` endpoint takes a Zod discriminated
union on `role`: a `FIELD` payload accepts the full onboarding shape (minimal at creation,
filled in incrementally via `PATCH`); an `ADMIN`/`HR`/`ACCOUNTANT` payload — the "user master"
path — is the short form (`employeeCode, name, email, phone, password, role` only), created
`active` immediately. Creating a non-FIELD user is Admin-only; creating a FIELD user is Admin or
HR, per the LLD's existing HR-field-force-only restriction. Enforced in `CreateUserUseCase`, not
just at the route.

**Why:** keeps the one HTTP surface the LLD already documents rather than adding a second
endpoint, while still giving Admin/HR/Accountant creation ("user master") a genuinely simpler
shape than FIELD onboarding — none of designation/pay-band/bank/manager/documents applies to them.

**Refs:** `apps/api/src/modules/identity/application/usecases/createUser.usecase.ts`,
`interface/users.schemas.ts`

---

## 2026-09-23 — Password hashing: bcrypt, with its 72-byte limit enforced not truncated

**Decision:** `bcrypt` (the `bcrypt` npm package, cost factor from `BCRYPT_COST_FACTOR`, default
12) hashes every `User.passwordHash`. Its 72-byte input limit is enforced at the Zod DTO layer
(`Buffer.byteLength(password, 'utf8') <= 72`, rejected with 400) on both password creation and
login — not silently truncated, which would otherwise let two different passwords sharing the
same first-72-byte prefix hash (and authenticate) identically.

**Why:** `docs/engineering/tech-choices.md` and `.env.example` had left bcrypt vs. argon2 open.
bcrypt ships prebuilt native bindings for common deploy targets (no build-toolchain risk the way
`argon2`'s native addon can carry) and is the specific standard for password hashing.

**Refs:** `apps/api/src/modules/identity/infrastructure/bcryptPasswordHasher.adapter.ts`,
`interface/password.schema.ts`

---

## 2026-09-23 — Bootstrap Admin seeded from env vars, exactly once

**Decision:** `identity`'s boot sequence seeds exactly one `ADMIN`-role `User` from
`BOOTSTRAP_ADMIN_*` env vars, gated on "does any ADMIN-role user exist" (not a one-time flag, so
it self-heals if the DB is ever reset) rather than a fixed run-once marker. Every Admin/HR/
Accountant after that first one is created the ordinary way — through that Admin's own
authenticated `POST /api/identity/users` call.

**Why:** creating a `User` normally requires an authenticated Admin, which is impossible on a
genuinely empty DB — this is the one exception, solving the chicken-and-egg problem without a
second, permanently-open creation path.

**Refs:** `apps/api/src/modules/identity/application/usecases/seedBootstrapAdmin.usecase.ts`

---

## 2026-09-23 — Money storage: `Decimal128`, provisional pending Payroll

**Decision:** `PayBand.base_salary/ta_per_km_rate/da_amount` (the first money fields to land) use
Mongoose `Decimal128` in `infrastructure/payBand.schema.ts`. The domain entity keeps them as
decimal **strings** — `domain/` never imports Mongoose (2026-09-19 decision) — so the conversion
lives only in `infrastructure/mongoPayBand.adapter.ts`.

**Why:** `docs/engineering/coding-standards.md#money` flagged this as undecided but required
before Phase 1, and named `Decimal128` as its own standing fallback pending a final choice against
driverzone's integer-subunit convention. Deliberately **provisional** — this entry exists so
Payroll (Phase 7) either ratifies or deliberately overrides it, not silently inherits it.

**Refs:** `docs/engineering/coding-standards.md#money`,
`apps/api/src/modules/identity/infrastructure/{payBand.schema,mongoPayBand.adapter}.ts`

---

## 2026-09-23 — MongoDB Atlas in every environment; no local Mongo container

**Decision:** `MONGO_URI` points at a MongoDB Atlas cluster in both development and production.
`docker-compose.dev.yml` and `docker-compose.prod.yml` define **no `mongo` service** in either
file.

**This reverses the pattern in the sibling reference project `../driverzone`**, which runs Mongo
as a local single-node replica set in `docker-compose.dev.yml` (with a one-shot `mongo-init`
container to promote it) for development, and a Docker-network-only Mongo service in
`docker-compose.prod.yml` for production.

**Why:** an Atlas cluster is already a replica set, so none of driverzone's `mongo-init`/
`directConnection=true` single-node bootstrap is needed here even if a module later needs
multi-document transactions. It also means one fewer moving part in local development — no
`docker compose up` before `pnpm dev`, no "did the replica-set init run" troubleshooting entry —
and production gets Atlas's managed backups and monitoring instead of a self-managed volume on
the deploy VM.

**Consequences:** `docs/setup-development.md` has no "start the dev stack" step; first-time setup
is `.env` pointing at a dev Atlas connection string, then `pnpm dev`. Clearing local dev data is
dropping collections on the Atlas dev cluster, not `docker compose down -v`. Production deploys
need the VM's egress IP allowlisted on the Atlas project before the API container can connect —
documented in [`manual_deploy.md`](manual_deploy.md). Every developer and every deploy target
needs network access to Atlas, which a fully offline/local-only setup (driverzone's default) does
not require.

**Refs:** `docker-compose.dev.yml`, `docker-compose.prod.yml`, `apps/api/.env.example`,
`apps/api/.env.prod.example`, [`setup-development.md`](setup-development.md)

---

## 2026-09-23 — Web portal is Next.js

**Decision:** `apps/web` (Admin/HR/Accountant portal, [`roadmap.md`](roadmap.md) phase 9) is
built on Next.js, matching `../driverzone/apps/web`'s stack and deploy pattern (standalone
output, `NEXT_PUBLIC_*` as Docker build args, same-site cookie auth if the eventual auth design
uses one).

**Why:** no HLD doc had picked a web stack yet — only the mobile stack was decided
(`hld/03-system-architecture.md` §1: React Native + SQLite). `apps/api`'s architecture was
already deliberately aligned to driverzone's (commit `041c5bd`), and Next.js is the specific
choice that keeps the eventual `build-and-deploy.md` and Dockerfile structure a copy of a proven
pattern rather than a second one to maintain.

**Consequences:** none yet — `apps/web` is not scaffolded. This entry exists so the choice is
recorded before Phase 9 starts, not discovered mid-scaffold.

**Refs:** [`roadmap.md`](roadmap.md) phase 9, [`engineering/tech-choices.md`](engineering/tech-choices.md)

---

## 2026-09-19 — Architecture aligned with the driverzone reference (shared kernel, module boundaries, tooling)

**Decision:** `apps/api` adopts the same architecture as `../driverzone/apps/api`: 4-layer
modules (`domain/application/infrastructure/interface`), a `.container.ts` composition root and
a `.public.ts` contract per module, and a `dependency-cruiser`-enforced tier graph
(`MODULE_TIERS`) mapping the 9 ERD modules onto explicit dependency tiers.

**Why:** the same shape had already proven out on a different product, and the specific problem
it solves — a module reaching into another's internals instead of a typed contract — is exactly
as real in a modular Mongoose monolith as it was there. Reusing a working pattern rather than
inventing a second one for a second product.

**Consequences:** `docs/hld/03-system-architecture.md` documents the tier mapping for greynote's
9 modules; `docs/engineering/` (this repo's engineering handbook, written to mirror driverzone's)
documents the pattern itself. The `health` module is the reference implementation every future
module copies from.

**Refs:** commit `041c5bd`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/module-anatomy.md`](engineering/module-anatomy.md)

---

## 2026-09-19 — Mongoose over the prior data-access approach

**Decision:** MongoDB via Mongoose is the persistence layer; Mongoose schema validation is the
primary validation at the persistence boundary, applied only inside each module's
`infrastructure/` adapter.

**Why:** captured in the PRD's switch-to-Mongoose commit; the ERD's ORM-agnostic entity language
(FK/join-table style) maps onto MongoDB with referential integrity enforced in the repository
adapters rather than the database, per `hld/03-system-architecture.md` §4.

**Consequences:** `domain/` and `application/` layers never import Mongoose — domain entities
stay plain TypeScript types — so a schema/model always lives in exactly one module's
`infrastructure/`, never shared, per `module-internals-are-private`.

**Refs:** commit `d52b99e`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md) §4

---

## 2026-10-05 — Roadmap after the backend: rule changes, payout split, master data, promotion, web views, app simulator

**Decision:** The 24-point brief of 2026-10-05 is sequenced in seven steps (`roadmap.md`, "Roadmap from 2026-10-05"):
(1) rule changes to existing code, (2) salary on the 1st / expense payout on the 15th with a period-based financial-year close,
(3) master data, (4) promotion, (5) web views, (6) an app simulator in the web (dev only), (7) the mobile app, then the pilot.

**Step 1 rules decided today:**
- **TA cap:** a Route's TA is paid for at most `TA_MAX_KM` km (default **99**, SystemConfig, Admin-editable). A longer distance is paid as the cap, not dropped.
- **Route type from distance:** a Route's type follows its distance from the HQ base place by two SystemConfig thresholds: over `EX_STATION_MIN_KM` (default **15**) → `EX_STATION`; over `OUT_STATION_MIN_KM` (default **50**) → `OUT_STATION`; otherwise `HQ`. Boundaries are strictly "over" (exactly 15 km stays HQ) — assumption.
- **Override with a warning:** whoever creates or edits a Route may pick a type that differs from the distance's. This is never refused; the screen and the API response carry a warning naming the type the distance suggests. The chosen type is what DA uses.
- **CTC and grade:** a CTC must stay inside its grade's range (already enforced on setting a CTC); a promotion that changes the grade must also land a CTC inside the new grade's range — assumption, wording to be confirmed.

**Why:** the Route's type drives DA, so it should not depend on someone remembering to set it; the thresholds are business numbers that change, hence config, and a warning rather than a block keeps a real exception (a short route that is really out of station) possible.

**Still open:** #23 meaning of primary/secondary sales; #9 probation start and leave types; the financial-year close date (proposed: Admin-set, after the 15th payout).

**Added 2026-10-05 (same day):** a day with several Routes pays TA for the **longest Route only**, capped at `TA_MAX_KM` (K4; replaces the earlier "cap on the day's total"); #12 (no approving after the date) is **dropped**; probation months come from `PROBATION_MONTHS` (6) but can be set per employee (`probationMonths`, empty = the default); `PROBATION_LEAVE_PAID` (default on) toggles whether unpaid leave inside probation is deducted; during probation a leave request skips the balance check and uses what balance exists, the rest is paid without a ledger row; Route `typeSource` AUTO/MANUAL (existing routes MANUAL); the ESI number is exactly 17 digits.

**Added 2026-10-06 — what a day earns:** an `HQ` Route earns **no TA** (DA only, at the HQ rate); field work on an Ex-station or Out-station Route earns TA and DA (TA for the longest non-HQ Route, capped at `TA_MAX_KM`; DA by the highest Route type of the day); a meeting or conference earns DA at the HQ rate and no TA; a strike earns nothing.

**Added 2026-10-06 — salary is separate from TA/DA (K5):** a payroll run is `base − leave deduction`, with no TA/DA or reimbursement in it (new runs hold 0 in those fields; finalized runs keep theirs); it snapshots the employee's ESI number for the salary slip. TA/DA and reimbursements move to their own payout on the 15th, by the month they were incurred. Payroll no longer depends on Field Activity.

**Added 2026-10-06 — closing a financial year (K8):** an Admin closes an *ended* financial year with an explicit action (`POST /api/config/financial-year/close`, reopen with `/reopen`; listed in `FY_CLOSED_YEARS`, a setting changed only through those endpoints, not on the settings list). While a year is closed, **payroll generate and finalize, paying an expense payout, and marking an expense paid** are refused for its months/days with a 409 `FY_CLOSED`; viewing is never affected. This is separate from the year toggle (which only makes a viewed past year read-only). Approvals, leave and plans keep their own date rules. Proposed, awaiting the owner: once an employee's salary run for a month is finalized, their **leave in that month is locked** (daily reports and expenses stay open until the expense payout on the 15th, because a report approved after the salary day still generates TA/DA for that payout).

**Added 2026-10-06 — leave is locked once salary is finalized (K12, accepted, with a setting):** when an employee's salary run for a month is `FINALIZED`, their **leave in that month** can no longer be requested, edited, approved or reopened (409 `PAYROLL_FINALIZED`), paid or unpaid; rejecting or withdrawing a leave that was never approved stays allowed. Daily reports and expenses are not locked (they feed the expense payout on the 15th). `LEAVE_LOCKED_AFTER_PAYROLL` (default on) switches it off. HR is below Payroll, so it asks through a port the composition root binds (`hr.bindPayrollLock`).

## 2026-10-06 — Step 3 decisions: product card, speciality dropdown, service types final

**Decision:** (1) A product is the pharma catalog card: brand, SKU, therapeutic class, composition, type (list), pack size, PTS, PTR, MRP (PTS ≤ PTR ≤ MRP), GST (list 5, 12, 18, 28 %), optional division, status. (2) The Doctor's **category is dropped** and **speciality becomes an Admin-managed dropdown** (a name and an active flag; no rank). Visuals are not tagged by speciality for now. (3) The four Doctor Service types (Tour package, Gift, Online promotion, Others) are **final** (sign-off C8, H4).

**Why:** the owner's product sheet and answers on 2026-10-06. A list for speciality stops the same speciality being typed three ways, which reports would otherwise split.

**Consequences:** older products keep working with the new fields empty. The doctor's `category` becomes optional and then unused (the phone's `NEW_DOCTOR` payload may still send it); `specialty` is validated against the list.

**Added 2026-10-06 — proof on medical leave (#11):** a leave type can allow proof; the employee may attach up to 3 files (PDF, JPG or PNG, 5 MB each), always optional, visible to whoever can see the leave (the employee, their managers, HR, Admin). Defaults were taken by the owner's "go": 3 files, 5 MB, approval chain and HR see them.

---

## 2026-10-06 — Promotion (roadmap step 4) and the CTC no longer sits in the grade

**Decision:**
- **CTC independent of grade (K10 changed):** a grade holds its name, DA rates and leave days, and **no CTC range**. A CTC is set per employee with no range check and no need for a grade first. This supersedes "a CTC must stay inside its grade's range" (2026-10-05, and the earlier pay-grade rule). Built first as step 4-0.
- **Effective date (K13):** a promotion takes effect on the **1st of a chosen month**, never mid-month. A future month is *scheduled* and applied on the 1st; a finalized salary month or a closed financial year is refused. A promotion on the 17th takes effect on the 1st of the next month.
- **Team handover (K14):** when the person has direct reports (and is the assigned MR/ASM of distributors), the promotion cannot be saved until each has a new manager — one for all, a group, or each one; "stay with the promoted person" is allowed with a warning. Until the effective month the person keeps their role, grade, CTC, team and approvals; on the 1st everything applies in one transaction.
- **Gap between scheduling and the 1st (K15):** the promotion still applies; anyone added since stays with the promoted person and is listed under "Needs attention".
- **Waiting requests (K16):** stay with the approver they were sent to until decided.
- **Leave (K17):** leave is by financial year; the current year's days and balance are untouched by a promotion, the new grade's days apply from the next year, and the screen shows days used and deducted.
- **History and reports (K18):** a promotion record plus a dated history of **every** manager change; a report for month M uses the team as of M.
- **Field work (K19):** ASM and above do field work, so routes, doctors and plans stay with them.
- **Warn, not block:** a manager whose level is not above their report's, and a promoted person left with direct MRs.

**Why:** pay and grade run by month, so a mid-month change would split one salary run; a manager's team must never be left without a manager; reports judge a manager on the team they actually had.

**Consequences:** `Promotion` record (from/to designation, grade, manager, effective month, CTC revision, handover plan, status scheduled/applied/cancelled); a manager-history collection; a run-script that applies due promotions on the 1st (repeatable, catches up a missed day). Sub-steps in `roadmap.md` item 4.

**Built 2026-10-06 (step 4-0):** a pay grade no longer carries `ctcMinAnnualPaise`/`ctcMaxAnnualPaise`; `assignCtc` has no range check and no longer needs a grade; a rise of more than `CTC_JUMP_WARN_PERCENT` (default 50, SystemConfig, Payroll group) over the previous revision saves and returns a `warning`, shown by the web as a notice. The old fields are removed by `migrate:paybands` (replaces `migrate:payband-range`; manual_deploy Step 9e). API 952 / web 574 tests pass; not browser-checked.

**Built 2026-10-06 (step 4a):** `Promotion` and `ManagerChange` in Identity; `POST/GET /api/identity/users/:id/promotions` and `.../preview` (Admin, HR). Scheduling is refused while any direct report is unplaced, a chosen manager is inactive or would make a loop, a promotion is already scheduled, the month is before next month, or nothing changes. A CTC with a promotion is checked against the formula at scheduling and saved as a revision when it applies; no grade range. Every change of manager through the profile edit is recorded for the month it is made in. **Correction to K14:** direct reports are required; a distributor's assigned MR/ASM is *optional* (to be added in 4b with the apply), because MR/ASM-level people keep doing field work. The minimum effective month is the next month, so the finalized-month and closed-year checks cannot trigger and are not built. Applying on the 1st, cancel/edit and "Needs attention" are 4b; the web screen is 4c. API 982 tests pass; not live-run.

**Built 2026-10-06 (step 4b):** promotions apply **inside the API** — a job on server start and every hour (plus `POST /api/identity/promotions/apply-due` for an Admin/HR button); **no operator cron and no run-script** (the owner rejected "someone must remember to run it"). A missed day is caught up on the next start. Cancel is `POST /api/identity/promotions/:id/cancel` (scheduled only); changing one is cancel and schedule again. "Needs attention" is derived from the current state (not-in-plan reports before applying; unplaced or unmoved ones after; a failure note), so it clears itself once HR fixes it. **Deviations from what was proposed:** opening the list does not apply anything (a GET with side effects); and the optional distributor handover is **not built** — nothing blocks without it, to be added when asked. API 997 tests pass; not live-run, not browser-checked.

**Built and browser-checked 2026-10-06 (step 4c):** web screens — an employee's **Promotion** tab (history, a Promote button), the page `/employees/:id/promote` (what changes, the team handover table with tick-and-place groups, "Move everyone to…", "stay with", leave card for the financial year in view, live server preview with problems and warnings, Schedule), and `/promotions` (every promotion, Needs attention first, Cancel with confirm, "Apply due promotions now"), plus a People nav entry for Admin and HR. **Browser pass on the dev database:** previewed, placed a team of two, scheduled, saw it listed; "apply due" said nothing was due; with the month pulled back by a direct database edit (test shortcut only) it applied for real — ZSM under the NSM, both MRs under the chosen manager, card turned Applied; a promotion with an MR added after scheduling showed the not-in-plan notice and cancelled cleanly. Found and fixed: the notice printed the name twice; the "new manager" picker offered the employee themselves. Web 583 tests pass. **Not exercised:** the hourly timer firing by itself, a promotion with CTC applying (unit-tested only), a failed apply shown to HR, distributors (not built). Dev data left: employees PROMONSM, PROMORSM, PROMORAJ (now ZSM), PROMOSAM, PROMOMR1-3 (password not for use), designations ASM/RSM/ZSM/NSM, two promotions (one applied, one cancelled).

## 2026-10-07 — Absent days cost salary; the Attendance module (roadmap step 5c, 5d)

**Decision (owner, 2026-10-06):** a working day with no submitted report, no approved leave and no strike is **absent** and is deducted from salary like an
unpaid-leave day (base ÷ 30). Strike days are **not** deducted by default; both are global settings: `ABSENT_DEDUCTS_SALARY` (on) and `STRIKE_DEDUCTS_SALARY` (off).
Sign-off K20, K25, K26.

**Built 2026-10-07:** a new tier-5 `attendance` module (a read model, no data of its own) with one pure rule `classifyDay` (before joining → not yet → holiday →
weekly off → leave → strike → present → absent; today is never absent); `GET /api/attendance/month` and `/payroll-calendar` (Admin, HR, Accountant); small
read additions to HR (`listLeaveDates`), Planning (`listDailyPlanDays`) and Field Activity (`listReportedDates`) so a month is a handful of queries. Payroll (now tier 6)
stores `absentDays` and `absentDeductionPaise` on each run, caps absent days with unpaid leave at 30, and shows them on the payroll screen, the run, the slip and the CSV.
Web: a Calendar tab on each employee, an **Attendance** page (every employee × the days of a month, with absent and deducted counts), and the new lines on payroll.
`MODULE_TIERS` changed (attendance inserted as tier 5; marketing and payroll now tier 6). API 1018 / web 594 tests pass; **not browser-checked, no live payroll run**.

**Cautions recorded:** a report submitted late or a leave approved late cannot change a finalized month; probation gives no protection to an absent day (assumption);
an unpaid leave stuck at the manager is neither deducted nor absent; the first payroll after the upgrade should be a draft read against the Attendance screen.

**Browser pass 2026-10-07 (Attendance page):** found that employees with no recorded joining date (active status does not require one) were counted absent from the 1st. Changed: such days are `UNKNOWN` (a ninth status), never deducted; the calendars show a warning and a "No joining date" badge. Rest of the page checked: the grid, legend, weekly off, today left blank, absent and deducted counts, totals note.

## 2026-10-07 — Reports module and the Orders page (roadmap step 5b, start of 5e)

**Decided with the owner:** orders keep Placed → Done or Cancelled; a chemist order is information only (no supplying distributor, nothing sent on); primary = Done orders to distributors (month marked Done), secondary = derived from the distributors' stock; reports are Admin only, by month inside the financial year in view, CSV; the Sales report gets a primary and secondary bar chart per month; five reports (Sales, Stock, TA/DA, DCR, Salary).

**Built:** a new top-tier (7) read-only `reports` module and its first report, **Orders** (API + the `/orders` page for Admin, with Done / Cancel on a placed distributor order). `MODULE_TIERS` gained tier 7. API 1024 / web 599 tests pass; **not browser-checked**. The Sales report, chart and the other four reports are next.

**Browser pass 2026-10-07 (Orders page, with the sample data):** September's Done (primary) read ₹56,990.00, equal to what the sample generator reported; the order dialog showed product names, prices and who finished it; marking a placed October order Done moved the totals exactly (Done ₹30,745 → ₹43,029, Placed ₹31,012 → ₹18,728) with a confirmation first and a toast after; Done and Cancel appear only on placed distributor orders; the chemist tab is information only. Not exercised: Cancel, the CSV download, the MR filter.

## 2026-10-07 — Sales report with the primary/secondary chart, and the Stock report (roadmap step 5e)

**Built:** `/reports/sales` and `/reports/stock` (Admin only, financial year in view, CSV) on the `reports` module, with the owner's definitions (K9, K21, K23, K31): primary = Done orders to distributors in the month marked Done; secondary = derived from the distributors' stock counts, valued at PTR (K22, built as proposed); chemist orders and counts are information only. A hand-drawn SVG grouped bar chart shows the year, a primary bar beside a secondary bar per month; an incomplete month's secondary is hatched.
**Browser pass (sample data):** the chart's bars and the table agree with the generator to the rupee (April primary ₹47,995 … September ₹56,990; September 2 of 3 distributors counted, hatched, with the warning naming the one that did not; October primary only, the rest of the year empty); the stock report showed the deliberate August mismatch (last closing 12, opening 15) and September's one missing count. The sample generator was changed so chemist counts carry forward. Found and fixed: the page opened on the unfinished month; it now opens on the latest ended one. Not exercised: the CSV downloads, the distributor and product filters, the quantity switch, a past financial year. API 1042 / web 614 tests pass.

## 2026-10-07 — TA/DA report (roadmap step 5e)

**Built:** `/reports/ta-da` (Admin only, financial year in view, CSV): accepted TA, DA and reimbursements by month and employee with paid and unpaid, the flag for a TA row whose distance could not be calculated, and a day-by-day view; it reads only and links to the Expense payouts screen to pay. The sample generator now also writes accepted expenses and daily-report rows for the three sample MRs (`seed:sample-sales`).
**Browser pass (sample data):** every month's total equals TA + DA + reimbursed and equals paid + unpaid (April ₹32,710.73 all paid; September ₹33,976.49 and October ₹7,153.62 unpaid; year ₹2,07,127.34 = ₹1,65,997.23 paid + ₹41,130.11 unpaid); the employee list and the day-by-day dialog worked, with the flagged ₹15.00 TA row marked. Not exercised: the CSV downloads, another month, a past financial year. API 1046 / web 620 tests pass.

## 2026-10-07 — DCR (daily reports) report (roadmap step 5e)

**Built:** `/reports/dcr` (Admin only, financial year in view, CSV): reported days, doctor and chemist calls, follow-ups, calls per day, late submissions and the geofence results by month and employee, and the doctors an employee was assigned but did not call on in a month. Calls only (K28). The sample generator now writes doctors, assignments, calls, follow-ups, approvals and route assignments.
**Browser pass (sample data):** 353 reported days over the year (369 reports less the drafts and rejected ones), 7.6 calls per reported day, 9% submitted late, 220 calls the geofence could not confirm; each month's geofence bar read 90 to 96%; the coverage dialog showed Promo Mr One calling on 11 of 12 assigned doctors in September, naming the one missed. Found and fixed: the first version read the timezone setting once per report and took over ten seconds; it now reads it once. Found in the sample data, not the code: doctors are invisible to an MR who does not cover their route, so the sample MRs now cover it. Not exercised: the CSV downloads, another month, a past financial year. API 1057 / web 625 tests pass.

## 2026-10-07 — Salary report; the reports set is complete (roadmap step 5e)

**Built:** `/reports/salary` (Admin only, financial year in view, CSV, K30): net pay by month and employee from finalized runs, the employer's contributions and the cost to the company, drafts hatched and outside the totals, and a stacked bar of net salary with TA, DA and reimbursements (or the deductions). With it the five reports the owner asked for — Sales, Stock, TA/DA, DCR and Salary — and the Orders page are built.
**Browser pass (sample data):** April's three MRs: base ₹92,000.00, deductions ₹4,333.33, net ₹87,666.67, employer 12% ₹11,040.00, cost ₹98,706.67; the year's finalized net ₹4,34,733.34 plus employer ₹55,200.00 = ₹4,89,933.34; September's drafts (₹88,000.00) hatched on the chart, labelled draft, and in no total; October shows only the TA and DA claimed so far. Not exercised: the deductions view, clicking a month, the salary-slip links, the CSV downloads, a past financial year. API 1063 / web 637 tests pass.

**Browser pass 2026-10-07 (Approvals in tabs):** the tabs showed All · 6, Daily report · 6 and the rest 0, from the six submitted sample reports; the Leave tab (`?kind=LEAVE`) showed the empty state; the Daily report tab (`?kind=DCR`) listed exactly those six, waiting on the manager; History kept the chosen tab, dropped the waiting counts as designed, showed the status filter and listed all 369 daily reports, with the approved ones marked as decided by Arjit Das; no console errors. Not exercised: bulk approve and reject, as Admin or HR, and the HR view (no tabs).

## 2026-10-07 — Side navigation grouped and collapsible

**Changed:** the rail now has seven groups in working order: Home (Dashboard), Daily work (Approvals, Attendance, Orders), People, Money, Reports, Master data (with Territory, Outlets and Catalogue sub-headings) and Setup. Home and Daily work are always open; the others open and close with a chevron, the choice is remembered in the browser, and the group holding the current screen opens by itself. Approvals shows a count of requests waiting (Admin and HR). Reports are ordered Sales, Stock, Daily reports, TA/DA, Salary.
**Browser pass:** as Admin on /payroll the Money group was open and highlighted, People, Reports, Master data and Setup collapsed, Approvals showed 6 and a dot in the collapsed rail. Not exercised: the mobile drawer, remembering the choice across a reload. Web 642 tests pass.

## 2026-10-07 — Manual test plan and the role-by-route table

**Added:** `docs/testing/` — a start-here page, the sample-data figures to check against, one checklist per area in dependency order (environment, access and roles, setup, master data, people, money, sales, reports, cross-cutting), a K-row traceability table and a defects / run-report template. The field loop (area 5) and the phone parts of orders wait for the Step 6 simulator. Also `apps/api/src/rbac.routes.test.ts` with the committed `rbac.matrix.txt`: every route with the roles its guards let in (`requireRole` and `authenticate` now carry their roles on the handler), so any widening or narrowing of access appears as a diff; reports and the Orders list are asserted Admin only. Regenerate with `UPDATE_RBAC=1`. The checklists are drafts: expected figures come from the earlier browser passes and the exact UI wording is to be corrected on the first run.

## 2026-10-10 — Product-wise targets over month ranges; achievement is the secondary the employee enters

**Decided (owner):** a target is **per employee and product** over **any run of whole months of one financial year** — a month, a quarter, the year, or anything between — set by Admin or the manager above, in **rupees valued at PTR**. **Achievement is no longer typed**: it is the **secondary the employee enters** (per product, per month, **no distributor**), valued at PTR. An employee's **primary** is their **Done orders to distributors** per product, and **Admin can change it** (an adjustment with a required reason, valued at PTS). Employee figures and distributor stock are **independent**: an employee's secondary never changes a distributor's closing, and Admin's distributor statement never changes an employee's achievement. For distributors, opening follows **last month's closing** automatically; primary comes from orders and Admin can adjust it; secondary is Admin's.

**Built:** Marketing `Target` gains `toMonth` (unique on user + range + product + campaign; overlapping ranges allowed, each measured on its own; a target counts an even share of each month when a shorter window is read); `GET/POST/DELETE /api/marketing/targets`; the typed `Achievement` route and use cases are removed (the collection stays as history, no longer read). Sales `EmployeeSale` (per user + product + month: secondary, Admin's primary adjustment + reason, history), `GET /api/sales/employee-sales`, `POST /api/sales/employee-secondary` (the employee, their manager or Admin; the stock deadline applies except to Admin), `POST /api/sales/employee-primary` (Admin), `sumUserOrders`. Reports `GET /api/reports/employee-sales` and the Sales Dashboard's target / primary / achievement now come from these. Web: `/reports/sales-dashboard/[userId]` (period, targets, by product, monthly entry grid); the dashboard row opens it. One-off `pnpm migrate:targets` (sets `toMonth` on existing targets and swaps the unique index) — **not yet run**.

**Open:** the phone's secondary-entry screen and a `SECONDARY_SALE` sync kind are not built (no mobile app yet; the web/API path exists); chemist orders are not part of an employee's primary (same rule as K31); two overlapping targets are both counted in the dashboard total; the old typed achievements are not converted.

## 2026-10-10 — Doctor birthday, anniversary and monthly visit frequency; missed calls

**Decided (owner):** a Doctor gets an optional **date of birth**, **anniversary** and a **visit frequency** (1–6, how many times the MR should visit in a month). The phone shows a **Missed calls** section: with frequency 4 and 1 call logged it reads "1 called, 3 missed" until the quota is reached; managers and Admin see the progress. **Assumed (to confirm):** frequency is a **standing value** that applies every month (changing it mid-month changes that month's quota; no per-month snapshot); only calls on **submitted or approved** daily reports count (the DCR report's rule), so a day's calls show once the day is submitted; the MR sets the three fields when **adding** a doctor, Admin edits all of the doctor, and a **manager** can change just these three for their downline's doctors; calls above a doctor's frequency do not offset another doctor's misses.

**Built (API + web only; the phone is another team's):** Doctor fields + sync snapshot + MR-add payload carry them; `PATCH /api/field-master-data/doctors/:id/targets` (Admin, manager of the assigned MR); Field Activity `countDoctorCalls`; Reports `GET /api/reports/doctor-visits`. Web: fields on the doctor form, a Visits tab, `/reports/doctor-visits`. No migration (new fields default to null).

**Open:** birthday/anniversary reminders are not built; a per-month frequency history; the phone's Missed calls screen and its offline add of the new fields (mobile team); managers have no web screen (the web portal is for office roles).

## 2026-10-10 — Configurable business-day start (`DAY_START_TIME`)

**Decided (owner):** the business day no longer rolls over at midnight. A new System setting, **Business day starts at** (`DAY_START_TIME`, any `HH:mm`, **default 00:00** so nothing changes until Admin sets it — expected `02:00`), makes a day run from that time to the next. Work at 01:00 on the 11th still counts as the **10th**: the Daily Plan day, DCR/call/expense `reportDate`, "today", attendance and compliance days. **Months and the financial year roll at the same moment** (the last day of a month ends at 02:00 on the 1st; instant range queries and the Done-order month grouping shift with it). **Dates of record are not shifted**: joining date, DOB, anniversary, holiday and leave dates read as typed. Admin may change it at any time (HIGH impact, portal reload); records already saved keep the day they were saved under.

**Built:** `businessDate(instant, tz, dayStart)`, `dayStartInstant`, `endOfBusinessDay` in `shared/time/businessTime.ts`; `readDayStart` / `readBusinessDay` in `shared/config/readConfig.ts` (a database not re-seeded yet reads as 00:00); the Dcr, Sales, Payroll, Plan, HR and Attendance clocks, the five reports, the financial-year guard/middleware/close, the stock deadline and the Mongo order sums (`$dateSubtract` before month grouping) all go through it. No range limit and no ordering against `DAILY_PLAN_SUBMIT_CUTOFF_TIME` (owner, 2026-10-10): the cutoff stays "that time on the plan's own date". `GET /config/public` returns `dayStartTime`; the phone's config snapshot carries `DAY_START_TIME`. Web: `istDate`/`istMonth`, the approvals date range. Field app: `businessToday(tz, now, dayStart)` and the Daily Plan deadline hint.

**Operator notes:** run `pnpm --filter @greynote/api seed` once so the key exists (until then it behaves as 00:00). The compliance and stock-check cron ("after the day rolls over") must be scheduled **after the day start** — with 02:00, run it at 02:30 or later, not at 00:05. A phone that has not synced since the change keeps the old rule until its next pull; the server's date-mismatch check on each record is the backstop.

**Open:** hand-checked on the phone and in the browser is still to do; the Settings screen needs a look at the new row's HIGH-impact confirmation.

## 2026-10-10 — Daily Plan doctor list and carry-over of missed calls

**Decided (owner):** the route still comes from the Monthly Plan (read-only on the Daily Plan), but the MR now **chooses the doctors to call that day**; **the number of doctors is the number of calls due**. A doctor planned and **not called** carries over to the **next days' lists** (owed until called). The carry-over is **added to the list automatically and the whole list (picks + carried) is submitted and approved again**. A carried doctor may be called **even if their route is not in that day's route**. How long a missed doctor carries over is **Admin's setting**: without limit (`CALL_CARRY_OVER_FOREVER`), or `CALL_CARRY_OVER_DAYS` days after the planned day, **0 = until the end of that month (default)**. The doctor-visits report shows, per doctor, the **days planned** and the **day first planned and never called since** (the missed call carried forward).

**Built (API + web only; the phone is another team's):** `DailyPlan.doctors[{ doctorId, carriedFrom }]` (kept apart from the route fields, so an inherited day stays route-locked while its doctors are editable; absent on older plans = none); `POST /api/planning/daily/doctors` (the MR; refused unless the plan is editable; doctors must be the MR's and on the day's routes); `GET /api/planning/daily/carry-over?date=`; the submit adds any still-owed doctor the MR left off; carry-over is **derived on read** from APPROVED plans and the reported calls (`listCalledDoctorIds`), not stored; Field Activity's `ROUTE_NOT_IN_PLAN` check passes a doctor the plan lists as carried; Planning `listPlannedDoctors` feeds `GET /api/reports/doctor-visits` (`plannedDays`, `missedSince`). Web: the approval preview lists the doctors with a "carried from" note; the doctor-visits dialog and CSV have the two columns. No migration.

**Assumed (to confirm):** a call clears a doctor if it is on a **submitted or approved** daily report on or after the day first planned (the DCR report's rule); a carried doctor who is no longer the MR's (inactive, reassigned) drops off; only **approved** plans create carry-over; at most 50 doctors a day. Manager amendments and in-day change requests **do not carry the doctor list** (it stays as saved).

**Open:** the phone's doctor picker, "carried from" chip and "calls due" counter (mobile team; the sync snapshot already carries `doctors`); run `pnpm --filter @greynote/api seed` so the two new settings exist (until then the reader would fail — seed before deploy); not browser-checked.

## 2026-10-10 — Calls to doctors outside the day's plan are allowed by a rule and flagged "Not in plan"

**Decided (owner):** an MR may log a call to a doctor who is **not on that day's doctor list** when Admin's rule **`ALLOW_UNPLANNED_DOCTOR_CALLS`** is on (**default on**). Such a call is saved and shown as **"Not in plan"** in the daily report (approval preview) and counted in the **DCR report**. When the rule is off the call is refused (`ROUTE_NOT_IN_PLAN`). **Flag only** — the MR is not asked for a reason. "Not in plan" means not on the day's list (picked or carried over), **whatever the doctor's route**.

**Built (API + web only; the phone is another team's):** `DoctorCall.notInPlan` (absent on older calls = in plan); `CallChecks.doctorInPlan` replaces the route check for doctor calls; Planning's `getDailyPlanDay` returns the plan's `doctorIds`; DCR detail carries the flag; `DcrMonthSummary.notInPlan` → the DCR report (`DcrFiguresDto.notInPlan`). Web: a badge on the call card, a notice above the doctor calls, a column, a tile and a CSV column on the DCR report. No migration.

**Assumed (to confirm):** a plan that lists **no doctors** (approved before doctor lists, or none chosen) keeps the old route rule and flags nothing, so those days are not locked out when the rule is off; a database without the key (not re-seeded yet) reads as **on**; chemist calls keep the route rule; an unplanned call counts toward the visit-frequency report and clears a carried-over entry like any other call.

**Open:** the phone should stop limiting the doctor picker to the plan's list (mobile team); run `pnpm --filter @greynote/api seed` so the setting exists; not browser-checked.

## 2026-10-12 — Daily Plan revisit: doctors only, day-bound late exceptions, one-miss block with audited unblock, no change requests

**Decided (owner):**
1. **The employee edits only the day's doctors.** Working type, routes, work-with and remarks come from the approved Monthly Plan; a manager or Admin changes them by **amending** the day (reason kept). The employee's save endpoint (`POST /planning/daily`) is removed; a day the Monthly Plan did not cover has no plan.
2. **Submit by the daily cutoff** (`DAILY_PLAN_SUBMIT_CUTOFF_TIME`). If missed, Admin (or a manager, while `LATE_PLAN_GRANT_BY_MANAGER` is on) grants a late-submit exception with a **custom end time, never later than the end of that plan's business day**.
3. **A daily report not submitted by the next day start (`DAY_START_TIME`, e.g. 02:00) blocks the employee** (the whole employee, as today) until unblocked. **Admin or any manager above the employee can unblock; a reason is required and kept** with who and in which role, as the audit trail. This **reverses** the ERD-01 / HLD-10 "Admin only" carve-out.
4. **Work needs an approved Daily Plan** — already the `LoggingGate` order (not blocked → monthly approved → daily approved); unchanged, documented.
4a. **Doctors on a day come only from the routes selected for that employee that day** — assigned to them and on the day's routes (already enforced by `CarryOver.compose`; now stated in `mobile/dailyplan.md` rule 2a). Carried-over missed calls are the one exception.
5. **The in-app "request a change" to an approved Daily Plan (B9) is removed.** The employee asks their manager or Admin outside the app; the manager amends.

**Built (API + web only; the phone is another team's):** `SaveDailyPlanUseCase`, the `DailyPlanChange` module parts (use cases, entity, schema, adapter, handler, three routes, `DAILY_PLAN_CHANGE` kind, `DAILY_PLAN_CHANGE_MAX`) deleted; `GrantLateSubmitUseCase` caps a daily exception with `endOfBusinessDay`; `startIntervalJob('missed-dcr-check', 15 min)` in `server.ts`; `UnblockUserUseCase` takes the acting role and a reason, checks the chain with `getManagerChain`, and writes `unblockedByRole` / `unblockReason` on the `ComplianceBlock`; `GET /identity/users/:id` returns `blockHistory`; the employee page asks for the reason and lists the history. `migrate:drop-plan-changes` (dry run by default, `--apply`) deletes old change requests and the `dailyplanchanges` collection.

**Assumed (to confirm):** "re-verify" means the doctor list is sent for approval again after the employee changes it (existing carry-over behaviour); a block placed at rollover refuses the next day's work, and the missed day's own report is not reopened by an unblock (Admin reopens it); a manager outside the chain gets `404`, not `403`.

**Open:** run the migration; set `DCR_MISS_GRACE_DAYS` to `0` (the seed never overwrites a live value); the phone must drop the save and change calls (see [`mobile/dailyplan.md`](mobile/dailyplan.md)); a web screen for managers to unblock their team; not browser-checked.

**Refs:** [`LLD/planning.md`](LLD/planning.md), [`LLD/identity.md`](LLD/identity.md), [`LLD/field-activity.md`](LLD/field-activity.md), [`hld/10-submission-gating-and-compliance-block.md`](hld/10-submission-gating-and-compliance-block.md), sign-off B6, B9.

## 2026-10-12 — Calls redesign: location on all four records, work/route type stamped, flags instead of refusals

**Context:** the owner re-verified the doctor call, doctor follow-up, chemist call and chemist follow-up and asked for stricter, uniform rules.

**Decided (owner):**
1. **Location (reverses H1 / 2026-09-29):** all four records capture GPS. The server compares it with the doctor's or chemist's registered location and **refuses anything but a `PASS`** with `NOT_AT_LOCATION` — out of the radius (`GEO_FENCE_RADIUS_METERS`, default 100 m), no GPS, accuracy worse than `GEO_MAX_ACCURACY_METERS`, or no registered location. A refused record is never stored, so a DCR can't reach the manager with a place mismatch. The manager `OVERRIDE` remains only for rows saved before this.
2. **Work type and route type are stamped by the server, not sent.** `workingType` comes from the day's plan; `routeId` and `routeType` (HQ / Ex-station / Out-station) from the doctor's or chemist's route. The chemist call has no work type of its own any more. DCR views and the web preview show both.
3. **Plan differences are flags (reverses B12 / 2026-10-03 and removes `ALLOW_UNPLANNED_DOCTOR_CALLS`):** doctor call/follow-up `notInPlan` (not on the day's list) and `routeNotInPlan`; chemist call `routeNotInPlan`, chemist follow-up `notInPlan` (route not on plan). Reported as `notInPlan`, `followupsNotInPlan`, `offRouteCalls` in the DCR report.
4. **Follow-up** = the doctor or chemist, remarks and GPS. No carry-forward (missed *planned* doctors already carry); an in-plan follow-up is just a note.
5. **Who can be picked:** one doctor = one employee (already so); one chemist can serve many employees through shared routes (already so). Unchanged.
6. **New work type `DOCTOR_CAMPAIGN`:** needs routes and has doctors like field work; pays DA at the highest route type and **no TA**.
7. **Meeting / Conference / Strike days:** no calls or follow-ups (`CALL_NOT_ALLOWED_FOR_WORK_TYPE`); the daily report is still submitted every day — `DCR_SUBMIT` carries `remarks`, required for Meeting and Conference (`REMARKS_REQUIRED`), optional for Strike. TA/DA unchanged.
8. **Remove before submit:** `DELETE /field-activity/dcr/:id/calls/:callId` and `/followups/:id`, owner only, while the report is open; a doctor call returns its samples. The app asks "Are you sure?" first.

**Assumed (to confirm):** follow-ups use the same strict location rule as calls (the owner said they "also need GPS"); the Meeting/Conference/Strike report design in 7 was our recommendation; a doctor or chemist with no registered location can't be recorded until Admin sets one (a stricter result than before, when it was flagged `UNVERIFIED`). Not added: a submit-time guard against non-`PASS` rows, because an MR with an old flagged draft would be stuck — the manager's `OVERRIDE` handles those.

**Built (API + web + docs; the phone is another team's — see [`mobile/dcr.md`](mobile/dcr.md)):** `CallChecks.day/route/doctorNotInPlan`, `GeofenceEvaluator.requirePass`, `LogFollowupUseCase` with GPS, `DeleteDcrRecordUseCase`, `SubmitDcrUseCase` note, `restoreRemaining` in Field Master Data, new report counts, approval preview badges and notes, `DOCTOR_CAMPAIGN` in planning and TA/DA. No migration (new fields default; old rows read as before).

**Open:** the phone app must drop the work-type picker from calls, add GPS to follow-ups and chemist calls, add the note to `DCR_SUBMIT` on Meeting/Conference days, and add the remove action; not browser-checked; Admin must set a location for any doctor or chemist that has none.

**Refs:** [`mobile/dcr.md`](mobile/dcr.md), [`LLD/field-activity.md`](LLD/field-activity.md), [`erd/04-field-activity.md`](erd/04-field-activity.md), sign-off B12, B15, H1, K40.

## 2026-10-12 — Doctor add: manager *or* Admin approves and may edit first; clinic name and phone; frequency 1–5

1. **Approval:** an MR-added doctor is decided by the MR's manager or Admin — either one, no second stage (`NEW_DOCTOR` is `managerOnly`; reverses the Employee → Manager → Admin chain of C4). Admin-added doctors are active at once.
2. **Edit before approving:** the manager or Admin can change any detail and the location (`PATCH /doctors/:id/review`, pending only). The phone's point is kept as `capturedLocation`.
3. **New optional fields:** `clinicName`, `phone`. **Visit frequency is 1–5** (was 1–6; a stored 6 stays readable).
4. **Missed calls:** each doctor row now has a `stage` (complete / in progress / not started) beside made, still-to-visit, planned days and "planned, not called since". Admin-added doctors count the same once assigned.

**Open:** the phone app (another team) must send `clinicName`/`phone`, cap frequency at 5, and the sync snapshot now carries both; not browser-checked.

**Refs:** [`LLD/field-master-data.md`](LLD/field-master-data.md), [`LLD/reports.md`](LLD/reports.md), sign-off C4.

## 2026-10-12 — Leave: probation switch at onboarding, approval cutoff at the leave's first day

1. **Probation is a per-employee switch** (`onProbation`, default No), set in the onboarding wizard and editable by HR/Admin. Months default to `PROBATION_MONTHS`. Reason: the *software* is new, not the employees, so recently-joined existing staff must not be treated as probationers. No migration (absent = No). In probation all leave is paid (unchanged from 2026-10-05).
2. **A leave can only be approved until its first day.** From the start date on, manager and HR approvals are refused with `409 LEAVE_APPROVAL_LATE` (reject / withdraw still work); an **Admin exception** (one use, expiring, reason required) lets one through. `LEAVE_BACKDATE_DAYS` defaults to **0** so a leave can't be requested for the past; an existing database keeps its stored value until Admin changes it in Settings.
3. **Unapproved leave = as usual:** only approved / manager-approved leave exempts a day from the missed-report block and the absent deduction; a pending or expired request does not. Already built; now written down in [`mobile/leave.md`](mobile/leave.md).
4. **Approvers:** manager, then HR or Admin (Admin may approve at any stage) — unchanged.

**Added the same day:** a server job (every 30 min) auto-rejects pending leaves whose first day has passed (history: "Automatic: …", balance freed; skipped while an Admin exception is usable), and Admin gets "Allow late approval" in HR → Leaves.

**Open:** employee cancel of an approved leave; not browser-checked; the phone app (another team) builds against [`mobile/leave.md`](mobile/leave.md).

**Refs:** [`LLD/hr.md`](LLD/hr.md), [`mobile/leave.md`](mobile/leave.md), sign-off F3, F14, K6.

## 2026-10-12 — Orders, visuals, secondary, targets, gifts, services revisited

1. **Orders:** a chemist order is **information only** — `complete`/`cancel` on one is `409 ORDER_INFO_ONLY`. A distributor order is marked **done** (or cancelled) by the MR or Admin and only then counts as primary.
2. **Visuals:** unchanged model — Admin owns the library, the MR **only adds** (from the library) per specific doctor, and a manager above them or Admin can add and take off. Web: Admin can add from the doctor page too.
3. **Secondary** is monthly, by product, as **units or amount**: the other follows from the product's **PTR** and both are stored. The employee's entry is a draft; they **send the month** and their **direct manager (Admin may decide instead)** approves it (`SECONDARY_SALES`, manager-only). Only **approved** lines count toward achievement; entries by a manager or Admin are approved at once. Existing rows read as approved (no migration).
4. **Targets** are per employee, per product, for a run of months, as an amount **or units** (units × PTR = amount; all-products targets are amounts). Achievement is the approved secondary against them, shown as amount % and units %.
5. **Gifts:** no change — Admin assigns, the doctor's MR marks done.
6. **Services:** after approval (Employee → Manager → Admin) a final step: **Admin or Accounts marks it done** (`doneBy`, `doneAt`). Accounts can see the Doctor services page.
7. **Mobile:** the *Monthly stock* tab is removed from the phone; the app cannot be changed from here, so the rules live in [`mobile/orders-and-stock.md`](mobile/orders-and-stock.md), [`mobile/secondary-and-targets.md`](mobile/secondary-and-targets.md) and [`mobile/visuals-gifts-services.md`](mobile/visuals-gifts-services.md). The server still accepts `MONTHLY_STOCK` records.

**Open:** the phone app (another team) builds against the three mobile notes; not browser-checked; `financialYear.routes.test` already lists `/expense-grants` as unclassified (earlier work, untouched).

**Refs:** [`LLD/sales-and-orders.md`](LLD/sales-and-orders.md), sign-off E1, G1.

## 2026-10-12 — Utility section: Inbox, holiday upload, Forms removed, FY re-verified

1. **Forms is removed** from Utility (PRD §6.2 D). There was no endpoint and none is planned; the phone drops the tile. Utility is now **Inbox · Holiday List · Financial Year**.
2. **Inbox is a server module.** The Admin sends a message (title, text, kind, optional expiry) to an audience: everyone, or any mix of roles, Zones, HQs and named people; a person matching several parts gets one copy. Recipients are fixed at send time (fan-out on write, text copied onto each person's receipt); expiry and "take back" make a message vanish from lists and the unread count. **No push** (the phone reads the list and the unread count); FCM later. The system-event feed (a target set, an exception granted, a call assigned) is **not wired**: `InboxPublicContract.notify()` is the hook, waiting on sign-off F8. Tier 3, depends on Identity and Territory. Not scoped by the financial-year header.
3. **Holiday list is uploaded by the Admin** as one CSV (name, date, scope, zones, hqs), previewed with `?dryRun=true`, all-or-nothing with errors by line, re-upload safe (existing holidays skipped). **CSV only** (Excel: Save as CSV) to match the existing hierarchy import and avoid a spreadsheet dependency; adding/removing single holidays stays. The CSV reader moved from Territory to `shared/csv`. Territory's contract gained `findZoneByName` / `findHqByName`; Identity's gained `listActiveRecipients`.
4. **Financial year re-verified, no code change.** Holidays stay timeless: previous years are shown by asking for that year's `from`/`to` (the phone and web already do). Every dated record list still honours `X-Financial-Year`, and a past year is read-only (HLD 9). The Admin year-close is unchanged.
5. **Mobile:** the phone is another team's; the rules are in [`mobile/utility.md`](mobile/utility.md), [`mobile/inbox.md`](mobile/inbox.md), [`mobile/holidays.md`](mobile/holidays.md), [`mobile/financial-year.md`](mobile/financial-year.md).

**Open:** the phone replaces its demo Inbox and removes Forms; push; F8; a people picker in the web compose form; not browser-checked.

**Refs:** [`LLD/inbox.md`](LLD/inbox.md), [`LLD/hr.md`](LLD/hr.md), [`erd/10-inbox.md`](erd/10-inbox.md), sign-off F8.

## 2026-10-12 — Employee's own reports (`/reports/me/*`)

**Decision:** FIELD users read their own TA/DA (year, days) and DCR (year, coverage) through `/reports/me/*`; the figures are the Admin reports narrowed to the signed-in user (no `userId` parameter). Bound to the financial year by the existing mechanism: current year by default, older years only via `X-Financial-Year`, read-only. Phone consumes; no web page.

**Open:** phone screens; leave and targets reuse `/hr/leave-balances/me` and `/reports/employee-sales`; sign-off K24a awaits the owner.

**Refs:** [`mobile/reports.md`](mobile/reports.md), [`LLD/reports.md`](LLD/reports.md).

## 2026-10-12 — Manager Team section: scope and first routes

**Decision:** managers get the Team section on the **phone only**; the web portal stays Admin / HR / Accounts (PRD §4 unchanged). We build the API and the contract note [`mobile/team.md`](mobile/team.md); the phone team builds the screens. Every team read goes through one access rule (`resolveTeamScope`): the whole downline, or one named person who must be in it (403 otherwise). First routes: `GET /team/members` and `GET /approvals/inbox/summary` (a live count, not tied to a financial year).

**Open:** the rest of the build order in `mobile/team.md`; client questions Q1–Q5 there (default depth, "not started" time, notifications F8, no salary for managers, no approving for an absent peer).

**Refs:** [`mobile/team.md`](mobile/team.md), [`LLD/approval.md`](LLD/approval.md).

## 2026-10-12 — Manager Team: Today, plans and leave calendar

**Decision:** the Team home is computed live per person from Planning, Field Activity, HR and Identity (no new collections). "Not started" is a working assumption: nothing logged by `TEAM_NOT_STARTED_AFTER` (new Admin setting, default 11:00, display only). A leave counts as "on leave" only once the manager has approved it; one still waiting is shown but does not change the person's state. Work logged on a leave or off day still counts as working. A future day is refused on Today; plans may be read for any day so a manager can see who has no plan for tomorrow. HR gains one read, `listLeavesForUsers`.

**Open:** client to confirm the not-started time (Q2); the rest of the build order; a team of more than ~500 may need a stored daily snapshot.

**Refs:** [`mobile/team.md`](mobile/team.md), [`LLD/team.md`](LLD/team.md).

## 2026-10-12 — Manager Team: overview report and person page

**Decision:** the "employee overall report" is the Sales Dashboard extended, not a new calculation: same audience rule, same working-day and compliance counts, plus calls, follow-ups, late and unconfirmed (geofence fail + unverified) and what attendance made of each day. Money and counts therefore agree with the dashboard. The person page (`/team/members/:id/summary`) composes the roster row, the Today row and that overview row; deeper lists stay the existing routes with the person's `userId`. A person outside the downline is always `403`, including a manager asking about a peer. Reports gets its first public contract so Team can read the overview.

**Open:** team orders and stock/secondary status (step 4); the overview reads the whole company's DCR summary for the month before narrowing (same as the Admin DCR report), fine today, revisit with a per-user query if it slows.

**Refs:** [`mobile/team.md`](mobile/team.md), [`LLD/reports.md`](LLD/reports.md), [`LLD/team.md`](LLD/team.md).

## 2026-10-12 — Manager Team: orders and stock

**Decision:** the manager reads the team's orders and stock/secondary status; they decide nothing there. Orders: chemist orders stay information only, distributor orders stay the MR's to mark Done or Cancelled; the manager's only decision on this side is the monthly secondary, in Approvals (`SECONDARY_SALES`). The month's secondary is one word per person (not entered, draft, sent, approved, sent back); a draft or sent month is shown but never counted as achievement (unchanged rule). Missing stock is a report to chase with, not a block (unchanged). `Cancelled` orders are listed but left out of the amount, as in achievement.

**Open:** notifications (F8). The team's API is complete; the phone screens are the other team's.

**Refs:** [`mobile/team.md`](mobile/team.md), [`LLD/team.md`](LLD/team.md), [`LLD/sales-and-orders.md`](LLD/sales-and-orders.md).

## 2026-10-12 — Manager Team: owner's answers and the manager's alerts

**Decision:** the owner answered the five Team questions (sign-off K42): whole team by default and read-only below direct reports; no salary or CTC for managers; Admin only approves for an absent manager; "not started" is 11:00 (the existing setting). For notifications, the manager is told in the Inbox of: a new **leave, monthly-expenses or new-doctor** request from a direct report; any request waiting past `APPROVAL_SLA_DAYS` (reminder only, nothing escalates); a direct report **blocked** for missed reports. Plans, daily reports and the other kinds stay with the badge because they arrive many times a day. Messages are digests (one per manager per check) so a busy moment is not a flood. A request is announced once per cycle, tracked in a new small collection (`team_alert_marks`, expires after 90 days, safe from several servers); a 5-minute server job sends them, and the missed-report job tells managers of the people it has just blocked. Admin can switch all of it off with `TEAM_ALERTS_ENABLED` (default on). The Team module therefore now owns that one collection.

**Open:** push (FCM) is the phone team's later work; notifying the *employee* of decisions (F8, other events) is still undecided.

**Refs:** [`mobile/team.md`](mobile/team.md), [`LLD/team.md`](LLD/team.md), [`LLD/inbox.md`](LLD/inbox.md), sign-off F8, K42.


## 2026-10-12 — Out-station trips: stay and transit days

**Decision:** a multi-day out-station trip is planned once. On the day the employee leaves they give a return date; the server fills the days between as stay days and the return day as a transit day. Pay: trip day TA + out-station DA; stay day out-station DA, no TA; transit day TA + ex-station DA (the pay band's existing ex-station rate). A same-day return has no return date and is an ordinary day. Stay and transit days are normal working days (approved daily plan, DCR, calls allowed), so the existing gates and TA/DA timing are unchanged. The client confirmed no separate Night Stay allowance is needed (D2 closed). Trips stay inside one month; the out-station route is checked at submit.

**Month end (same day):** a trip may return in the month after. Its days there go into that month's plan, created as a draft if needed; the month still has its own approval and deadline. Refused if that plan is frozen or already has one of those days. Not beyond the next month.

**Open:** the phone screens (mobile team).

**Refs:** [`mobile/monthlyplan.md`](mobile/monthlyplan.md) rules 16-17, [`LLD/planning.md`](LLD/planning.md), [`hld/06-ta-da-auto-calculation.md`](hld/06-ta-da-auto-calculation.md), sign-off D2.


## 2026-10-13 — Web portal refactor: new menu, role guard, field staff kept off the web

**Decision:** the web portal is reorganised in steps (plan: Foundation, order dispatch, HR, Payouts, Sales & Distribution, Reports, Master data, System settings, global dashboard). Step 0 done: the side menu has eight places (Home, HR, Sales & Distribution, Payouts, Reports, Master data, System; Home is always open) instead of seven loose groups; late submissions sit under HR, late expenses under Payouts, pay structure (designations, pay grades, pay components) under Master data. A page a role has no menu item for now shows a "no access" message instead of an API error (`canOpen` in `nav-items.ts`; a test checks every page belongs to a menu item). A field employee is refused at web sign-in (`X-Client: web`, `403`) and sees a "use the mobile app" screen if a session somehow exists. Admin, HR and Accountant can still use the phone app.

**Decided for later steps:** one distributor workspace reached from both Master data and Sales; Reports become one landing page of cards (each report its own page); the Accountant marks orders **dispatched** (new Orders status, Step 0b) and loses Doctor services; HR sees leave approvals only.

**Open:** the Reports link and the other items in Step 4 are still the seven separate entries until that step.

**Refs:** `apps/web/src/components/shell/nav-items.ts`, `NoAccessScreen.tsx`, [`LLD/identity.md`](LLD/identity.md), [`testing/01-access-roles.md`](testing/01-access-roles.md).


## 2026-10-13 — Public account-deletion page and the first rate limit

**Decision:** Google Play needs a public deletion URL, so the company website gets a form (employee code + password) that calls a new unauthenticated route, `POST /api/identity/auth/delete-account-public`. It runs the same deletion as the in-app route, so the account is closed and cannot sign in again. A wrong code and a wrong password give the same `401` in the same time. Only field accounts; office roles are refused. The route is limited to 5 tries per 15 minutes per address and per employee code (`express-rate-limit`), because it checks passwords and then destroys data. `https://www.greynotehealth.com` is added to the production `CORS_ORIGINS`.

**Cost:** this is the API's first rate limit; sign-in has none (follow-up). The limiter is in memory per process, so it is per server instance.

**Open:** the apex domain `greynotehealth.com` if used; a support email on the page for office roles, which this route refuses.

**Refs:** [`LLD/identity.md`](LLD/identity.md), [`mobile/account.md`](mobile/account.md), `apps/api/src/modules/identity/interface/auth.route.ts`.


## 2026-10-13 — Accountant marks orders Done; Doctor services become read-only for Accounts

**Decision:** the Accountant may see every order and mark a placed distributor order **Done** or **Cancelled**, the same as Admin (`/sales/orders/:id/complete` and `/cancel`, `GET /sales/orders`, `GET /reports/orders`); Orders sits under Sales & Distribution for Admin and Accountant. No new status: "dispatched" is the existing **Done**, so a Done order still counts as a primary sale in the month it is marked. Doctor services: Accounts keeps the page and the status, but **only Admin marks an approved service done** (this reverses the earlier rule, in the Doctor services decision, that let Accounts do it).

**Distributor payments (same day):** the Accountant records and cancels distributor payments on the web (the API already allowed it) and, to do so, reads the distributor list and one distributor (`GET /field-master-data/distributors[/:id]`) and the monthly statement (`GET /sales/distributor-statement`: stock, primary, secondary), all read only; adding or editing a distributor and saving a statement stay Admin's. Distributors now has a door in Sales & Distribution (Admin, Accountant) as well as Master data > Outlets (Admin). The Accountant's page has Payments, Orders and Stock tabs, and no territory filters (territory stays Admin's).

**Open:** an "awaiting" default filter on Orders.

**Refs:** [`LLD/sales-and-orders.md`](LLD/sales-and-orders.md), [`LLD/field-activity.md`](LLD/field-activity.md), `apps/api/src/rbac.matrix.txt`.


## 2026-10-13 — Payouts redesign: Expenses and Payroll as two independent month-runs (decided, not built)

**Decision:** Expenses and Payroll each become a month page on the same pattern: month picker, a table of employees, a review page for one employee-month, HR edits, **Accountant finalizes and pays**, Admin can do everything. They run on **different clocks and never block each other**: expenses are submitted by the 7th, approved by the 10th and paid by the 15th of the next month (`EXPENSE_PAYOUT_DAY`); a month's payroll can be run from the 1st of the next month. Each page shows its own due date.

**Expenses (Track A, built first):** Expenses and Expense payouts merge into one page (name, code, TA, DA, other, total, status: Not submitted, Submitted, Approved, Finalized, Paid). The review page shows each day: date, work type, workstation (HQ, ex-station, out-station), route, TA, DA, other, and whether a leave day is paid or unpaid (read only there). HR may raise or lower a day's amounts with a mandatory reason; the original, the new value, who and when are kept, shown as "edited by HR" to the employee, Accountant and Admin. **Finalize** locks the month and payout is made only from a finalized month. The Late expenses page goes away: Admin's "Allow late" is a button on the month row.

**Payroll (Track B, after A):** same pattern. HR can mark a day paid or unpaid (an override on the payroll run, with a reason; the leave request is not rewritten) and add a plus or minus adjustment (reason), audited the same way. Generate makes an editable draft; **Finalize locks it**; a new **Paid** state (date, reference) follows. The payslip shows the adjustments.

**Today (for the record):** no one can edit expense amounts after submit (Admin reopen is the only way); payroll has Draft and Finalized only, is run by Accountant and Admin (not HR), and cannot be edited; there is no original-versus-edited record anywhere.

**Open:** the phone's "edited by HR" display (mobile team); whether HR gets a read view of the expense approval list.

**Refs:** the plan in `/home/arjit/.claude/plans/payouts-redesign.md`, [`LLD/field-activity.md`](LLD/field-activity.md), [`LLD/payroll.md`](LLD/payroll.md).


## 2026-10-13 — HR can change a month's amounts, with a record (Track A step 2)

**Decision:** HR (and Admin) can raise or lower any unpaid expense amount of a day, or add a TA or DA to a day that had none, from the review page. A reason is mandatory. The first amount stays on the row and every change is kept in an append-only log (before, after, reason, who, when), shown on the review page as "was ₹X" and a list of changes. Paid rows and closed financial years cannot change. An employee can no longer edit an `OTHER` claim HR has changed.

**Open:** notifying the employee (inbox) and the phone display; locking the month at Finalize (step 3); whether the Accountant may also edit (for now no: the Accountant finalizes and pays).

**Refs:** [`LLD/field-activity.md`](LLD/field-activity.md) (HR edits a month's amounts).


## 2026-10-13 — Finalize closes a month of expenses; only a finalized month is paid (Track A step 3)

**Decision:** after the manager's approval and HR's review, the Accountant (or Admin) **finalizes** an employee's month. Finalizing locks the amounts (no HR edit or add), makes the month impossible to reopen or send back, and makes it payable: payment (single, pay-all, payout sheet) now needs `accepted`, `monthApproved` and `monthFinalized`. Only an approved month, once it is over, can be finalized; there is no un-finalize. Stages shown to the people running it: Not submitted, Waiting for approval, Approved, Finalized, Paid.

**Cutover:** months from before the cutover keep being payable through `migrate:expense-finalized` (not run yet); months after it are finalized in the portal.

**Open:** merging Expenses, Expense payouts and the inline "Allow late" into the one page (step 4); the phone showing "edited by HR" and "finalized" (step 5).


## 2026-10-13 — Expenses, Expense payouts and Late expenses become one page (Track A step 4)

**Decision:** one **Expenses** page: the month table with Finalize, Pay and "Allow late" on each row, a Late exceptions tab for Admin, and the day-by-day review one click away. Expense payouts and Late expenses are no longer separate pages (their old addresses redirect). The row-by-row list of claims stays as **Expense claims** for the Accountant and Admin. "Allow late" is offered only where it is needed: a month past its send or approval deadline that has something claimed.

**Open:** the phone showing "edited by HR" and "finalized" (step 5); HR still sees only Expenses under Payouts.


## 2026-10-13 — Payroll: HR adjusts a draft, Finalize locks it, the Accountant marks it paid (Track B, API)

**Decision:** payroll follows the same pattern as expenses. A generated run is a **draft** that HR (or Admin) can adjust: charge a day differently (an absent day not charged, a worked day charged) or add or take off an amount, each with a reason; every change is kept with what the rules gave, who and when, and the run shows the net the rules gave beside the net now. Regenerating a draft keeps the adjustments. **Finalize** (Accountant or Admin) locks it and now records who; the Accountant then marks the salary **paid**, with an optional reference. HR can read the whole month (not generate, finalize or pay). Payroll and expenses stay independent: salary can be generated from the 1st of the next month.

**Open:** the web screens (month table, review with the day grid, adjust and pay dialogs), the payslip on the phone showing adjustments (it uses the shared `payslipOf`), and a Paid mark in the salary report.

**Refs:** [`LLD/payroll.md`](LLD/payroll.md) (HR adjusts a draft).


## 2026-10-13 — Web refactor, Step 1 (HR): five-tab employee page, Leave setup, Employees list chips

**Decision:** the employee page has five tabs, each one job: **Profile** (basic, address, work, documents), **Pay** (bank and compensation/CTC), **Time off** (calendar and leave), **Career** (promotion history) and **Access** (devices and security, Admin only). The nine old tab names still work in a link (`?tab=compensation` opens Pay). The rules HR sets once (**leave types** and the **leave master**) moved from Leave & holidays to **Leave setup** under Master data (a new "HR setup" section with Designations); Leave & holidays keeps Leaves and Holidays, and `/hr?tab=types|master` redirects. The Employees list shows **status chips with counts** (All, Active, Onboarding, Inactive) in place of the status dropdown, and a **needs attention** line (still being onboarded, blocked from submitting) that filters the list.

**Open:** HR features the client still wants on this module (to be listed); "missing documents / no CTC" in the attention line needs a list endpoint that reports them; saved filters were not chosen.

**Refs:** `apps/web/src/features/people/lib/employeeTabs.ts`, `employeeChips.ts`, `features/hr/components/LeaveSetupScreen.tsx`, [`testing/01-access-roles.md`](testing/01-access-roles.md).

## 2026-10-13 — Employee ids are GH101, GH102 … (replaces the GRN0001 format)

**Decision:** new employees get `GH` + a plain number from the same atomic counter, starting at `GH101` (no zero padding; past 999 it just grows). On first use the counter starts at the highest existing `GH\d+` code, or 100 if there is none. Employees who already have a `GRN` code (or a hand-typed one) keep it; nothing is renamed or migrated. Supersedes the "Employee id" line of 2026-10-09.

**Open:** whether the old `GRN` employees should be renamed too (it would change what they log in with). *Closed by 2026-10-15 below.*

## 2026-10-13 — Field employees get an optional profile photo

**Decision:** the photo is picked at the top of the wizard's **Personal** step (step 1), is optional and does not affect activation. It lives on the FIELD profile (`photo {url, publicId}`) and, until the employee exists, in the draft's own `data.photo` section. JPG, PNG or WebP (checked by the file's first bytes), up to 5 MB, stored by Cloudinary at 512×512. Admin and HR set it (`PUT .../photo`) or remove it (`DELETE .../photo`) on the employee page as well. **Replacing or removing deletes the old file from Cloudinary**: new file saved first, then the old one deleted; a removal deletes the file before clearing the record, so a failure can be retried. A draft that is discarded, and a deleted account, delete their photo too. Clients only ever get `photoUrl`, never the storage id. If the draft does not exist yet when a file is chosen, it is held in the browser and uploaded right after the first Next creates the draft. Developed on its own branch (`feat/employee-photo`, in a separate worktree) because `main` had other work in progress.

**Open:** the phone app showing and changing the photo (the API already returns `photoUrl` on `/auth/me`); whether a photo should become required for field employees.

## 2026-10-13 — Production starts from a new empty database; dev data is not wiped

**Decision:** instead of deleting dev data (which would also delete the Play reviewer's demo accounts), production gets its own new database, seeded by `seed-production` (`apps/api/src/scripts/seed-production.ts`): config defaults, roles, pay components, leave types, the five designations, the pay bands from the reviewed `apps/api/prod-seed/payBands.json`, one Admin and the demo accounts (DEMOMGR, DEMOMR1-3) with the password already given to Google Play. The dev database is left as it is. The script refuses unless `NODE_ENV=production`, `--confirm-db=<name>` equals the database in `MONGO_URI`, and the database has no users. The Admin's 16-character password is random, printed once and never stored or logged. Prod uses its own JWT secrets and Cloudinary account (dev files stay in the dev account). The demo script's logic moved to `demoAccounts.ts` so both scripts share it, and both scripts are now built into the image.

**Open:** the pay band rates in `payBands.json` came from dev and look like placeholders (identical across G1-G3 and Trainee) — set the real ones before go-live; the Admin's details (code, name, email, phone) come from the owner at run time.

## 2026-10-14 — Visuals are images only; the Visuals page shows previews

**Decision:** Admin can upload only images (PNG, JPG, WebP, GIF, ≤ 25 MB) as Visuals; PDFs and videos are refused by the API and the upload form. This supersedes the "image / PDF / MP4-MOV-WebM" line of the Marketing entry above. Visuals already uploaded as PDF/video are left as they are. The Visuals page and a doctor's Visuals tab show a thumbnail per row, and clicking it opens a near-fullscreen view (Esc closes; "Open in new tab" stays).

## 2026-10-14 — Files open in a viewer on the employee page and the Documents library

**Decision:** an employee's uploaded documents (Profile tab) and the company document library show a thumbnail per row, and clicking opens a near-fullscreen viewer (image fitted, PDF in a frame, Esc closes, "Open in new tab" stays). The viewer and thumbnail are shared components in `apps/web/src/components/ui` (`FilePreviewDialog`, `FileThumb`), which the Visuals screens now use too. The kind of an employee document is read from the extension on its stored URL. Web only; no change to who can see or change documents, or to the document types.

**Open:** whether Cloudinary's PDF URLs render inside the frame in a real browser (the "Open in new tab" link is the fallback).

## 2026-10-14 — EPF number, the ESI wage ceiling from config, and ESI/EPF warnings in payroll

**Decision:** an employee gets an optional **EPF number** beside the ESI number (employee page, onboarding wizard, payslip and the run's snapshot). Which employees need ESI comes from a new setting `ESI_WAGE_CEILING` (PAYROLL, whole rupees, seeded 21000): ESI covers a monthly gross **at or below** it (the statute says "₹21,000 or less"), measured on the run's monthly gross. Payroll **warns, never blocks**: employees at or below the ceiling with no ESI number, and anyone with no EPF number. The warning is on the month's payroll page and in the Generate result; each line opens the Employees list narrowed to exactly those people (`ids` filter) with a chip to clear it. It is computed live from the profile, so fixing a number clears it with no regeneration.

**Assumed (confirm with the client):** the EPF number's format. Regions format member ids differently, so only 1–30 letters, digits, `/` or `-` is checked (stored upper-case). A 12-digit UAN fits. Tighten when the client names one. The EPF warning covers every employee, with no salary limit.

**Open:** run `seed` on dev and prod so `ESI_WAGE_CEILING` is in the database (until then the seeded 21000 is used). Old payroll runs show no EPF number on their slip (snapshot is null); regenerate a draft to fill it.

## 2026-10-14 — Pay components follow the salary slip: CTC = total earnings, employee deductions, mandatory professional tax

**Decision:** the sample slip (a ₹14,000 earner) is the company's real distribution, so the CTC formula is rebuilt around it. **Supersedes** the 2026-10-05 and 2026-10-09 CTC entries where they differ (Basic 30–60%, employer EPF/ESI inside the CTC, `EMPLOYER_CONTRIBUTION`).
- **The CTC is the total earnings.** Monthly pay = CTC ÷ 12. The earnings (Basic, HRA 66.36% and FDA 10% and Conveyance 42.56% of Basic, Medical, and "Special allowance" as the balancer) **add up to the CTC exactly**, checked on every save. **CTC and Basic are the only inputs**; Basic is a percentage of the CTC (now **any value up to 100%**, the 30–60% rule is gone) **or a monthly amount**; every other line is derived. A Basic that makes the lines exceed the CTC is refused with the shortfall.
- **Deductions are the employee's own**, worked out beside the CTC and not part of its sum: **EPF** 12% of Basic + FDA; **ESI** 0.75% of the total while the monthly salary is at or below `ESI_WAGE_CEILING` (the employee share; the old 0.75% "employer" line is this one, relabelled); **Professional tax** from the slabs.
- **Professional tax is mandatory** and comes from the setting `PTAX_SLABS` (Settings → Payroll, a table editor): ₹110 from ₹10,000, ₹130 from ₹15,000, ₹150 from ₹20,000. It is measured on the **monthly salary (total earnings)**, as on the slip (₹14,000 with Basic ₹5,600 → ₹110), not on Basic. **A monthly salary below the first slab (₹10,000) cannot be assigned.** Pay components gain a **`mandatory`** flag: a mandatory line can't be switched off, removed for one employee, made optional or given another rule.
- Payroll takes the frozen deduction lines each month (full contract salary, not reduced by leave days; never more than the pay left after leave/absent days), then **rounds the net to the nearest rupee** and shows the difference as "Rounded off" beside the net (slip: ₹13,150.80 → ₹13,151). The slip is redrawn like the sample (employee and employment details, earnings and deductions tables, UAN = the EPF number, net).
- A changed slab or ceiling applies to CTCs saved or **re-applied** from then on; saved revisions stay frozen (the existing Re-apply action). Old revisions keep their employer lines and are still read.

**Assumed (confirm with the client):** HRA/Conveyance shares (taken from the slip's exact ratios); statutory deductions on the full contract salary; net rounded to the rupee; **ESI is deducted for anyone within the ceiling whether or not an ESI number is set** (the slip shows ESI ₹0 for a ₹14,000 salary, which may mean the employee had no ESI number: if so, deduct only when the number is set); employees under ₹10,000 a month are listed by the migration, not changed; EPF number = the UAN on the slip.

**Open:** run `seed` (adds `PTAX_SLABS`), then `migrate:ctc-statutory -- --from YYYY-MM` (dry run first); the slip has a text wordmark where the logo goes: supply the logo file; leave balance and leaves taken on the slip.

## 2026-10-14 — Office orders, Accountant access, per-distributor primary, sales valued at PTS

**Decision:**
- **Admin and the Accountant can add an order for a field employee** (`POST /api/sales/orders/on-behalf`): credited to that employee, to one distributor **or** one chemist (never both; still one outlet per order), the outlet need not be on the employee's Routes. The order records who added it (`createdBy`).
- **Admin and the Accountant can change a `PLACED` order** (`PATCH /api/sales/orders/:id`): lines, quantities, unit prices and remarks; employee, outlet and date stay. Server recomputes every amount; the change is one conditional update, so a racing Done/Cancel wins and the edit is a `409 ORDER_NOT_PLACED`. The order keeps `editedBy` / `editedAt`. After the change the office marks it Done as before. A Done or Cancelled order cannot be edited. The employee on the phone sees the edited order after the next sync.
- **The Accountant adds and edits distributors** (same form as Admin). To let the form work, the Accountant may *read* zones, HQs and routes (lists only) and a names-only list of active field employees (`GET /api/identity/work-with/directory`); employee records, territory changes and everything else in those areas stay Admin's (HR for people).
- **The Accountant opens the Sales dashboard and an employee's sales report** (read only, all employees), and sees a **"Salary paid" card on Payroll**: the company total marked paid, month by month (`GET /api/payroll/paid-totals`), no names, no per-employee amounts. The Accountant's existing payroll sheet (generate, finalize, pay) is unchanged.
- **Employee report shows primary by distributor**: Done orders to each distributor in the range, adding up to the order part of the employee's primary. Secondary is entered per employee and product, not per distributor, so it has no per-distributor row; a distributor's own primary and secondary (from their counts) stay on the Sales report.
- **All sales are valued at PTS, not PTR.** Secondary, achievement, targets (rupees ↔ units), the distributor secondary on the Sales report and the Admin's primary adjustment all use the product's PTS. **Supersedes** every "valued at PTR" line in the 2026-10-09/10 entries. Primary from orders stays at the price on the order (the phone pre-fills PTS for a distributor, PTR for a chemist).

**Assumed (confirm with the client):** existing targets entered in rupees are **not** converted: they now read as PTS rupees (a target set as units is unchanged). Secondary amounts saved before today are restated at PTS from their units when read. The report flag `NO_PTR` is now `NO_PTS` (secondary has no price) and `NO_PTS_CHANGE` (Admin's change has no price). A product without a PTS can take units only, as before without a PTR.

**Open:** per-distributor *secondary per employee* would need the employee to enter secondary by distributor (not built). Phone app: docs updated, no code.

## 2026-10-14 — Part supply and free units at Mark Done; achievement from distributors' secondary; distributor dues

**Decision:**
- **Mark Done records what was delivered.** Admin or the Accountant mark a distributor order Done with, per product, the units **supplied** (0 up to what was ordered) and any given **free** on top (`POST /sales/orders/:id/complete` with `supply`). With no `supply` (the phone's Done, or the web with nothing changed) the order is delivered in full. The employee's ordered lines and total are never rewritten; the order also keeps `suppliedQty`, `freeQty` per line and `suppliedAmountPaise`. An MR marking their own order done cannot send a supply (403). Done is final.
- **Money:** primary counts **supplied × the order's price**; free units are never rupees. **Units** (stock, secondary) count supplied + free. An order marked Done before this change reads as fully supplied (no migration). The employee sees ordered / supplied / free / short on their order (phone doc); the office sees them on the web.
- **Achievement per product = the sum, across the distributors handed to the employee (`assignedUserIds`), of that product's secondary** (opening + units delivered − closing, from Admin's statement or the field counts, as on the Sales report), valued at PTS, over the target's months. **Supersedes** "achievement = the secondary the employee enters" (2026-10-10/12): the entered secondary and its approval stay as records but no longer count; the Sales dashboard and employee report use the distributors' figure. `GET /marketing/targets/:userId` (orders-based) is unchanged.
- **Distributor dues = opening dues + Done orders delivered − recorded payments**, all time. `openingDuesPaise` is set when adding a distributor (Admin or Accountant) and editable. Shown on the distributor's Payments tab and as a Dues column on the Distributors list.
- **Setting a target** is unchanged: Admin, or a manager for their downline, Sales dashboard > employee > Set a target.

**Assumed (confirm with the client):** a distributor handed to several employees counts in full for each (achievements can add up to more than the distributor sold); a month with no count or statement for a distributor adds nothing (a gap, not zero); a negative derived secondary is left out; only **active** distributors count; dues use Done orders by completion date with no financial-year cut-off, and opening dues is one editable number with no history; an all-zero supply is allowed (Done with nothing delivered).

**Open:** achievement needs a stock count or Admin statement per distributor and month: until then it reads 0 or a gap. Phone app: docs updated, no code.

## 2026-10-14 — Free units can be planned in Add/Change order; the first change keeps what the employee ordered

**Decision:** Admin/Accountant can set **free units** per line when adding or changing an order (`freeQty`); Mark Done prefills them and a line not named at Done keeps them. An employee's own order never carries free units (ignored). The **first change** to an order keeps what the employee ordered (`originalItems`, `originalTotalAmountPaise`; later changes keep that first record). The Change order form shows "Originally ordered: qty × price" under each line (highlighted where it now differs, "Removed" for dropped lines) and the order detail lists the original. The change itself is guarded against a concurrent edit (`editedAt` unchanged since read).

## 2026-10-14 — A manager plans their day with the team; a manager's target is the total of their MRs

**Decision:**
- **Manager = any FIELD employee whose designation is above MR** (ASM, RSM, ZSM, NSM), whether or not anyone reports to them yet. Designations are the fixed five (MR level 1 … NSM level 5), so no flag or migration: the server reads the level. An MR is level 1.
- **Manager's Daily Plan.** The manager keeps the Monthly Plan; the inherited Daily Plan draft is **editable for a manager**. They choose **Work With** from their **whole downline** (any depth, active), and the **routes and doctors fill in** from those people's plans; the routes are then fixed by who they picked and the manager can add or remove doctors (see the later entry today, which also removes route and remark editing), and submits as before (their own manager, then Admin approve). `POST /planning/daily/plan` saves the day; `GET /planning/daily/team-suggest?date&userIds=` returns the fill: each person's Daily Plan routes and doctors for the date, else (no plan yet) the Monthly Plan entry's routes and the doctors assigned to them on those routes. The fill is a snapshot: the phone offers "Refresh from team" (calls `team-suggest` again) while the plan is editable.
- **What a manager may use.** Routes and doctors from **their own** assignments **or from the team members named** in Work With; anything else is `400`. The same check runs again at submit and when a manager/Admin amends. A day of an out-station trip keeps the trip's routes (change the trip's first day). A day that isn't field work or a campaign has no routes or doctors.
- **Doctor cap.** An MR's day stays at 50 doctors; a manager's is the Admin setting `MANAGER_PLAN_DOCTORS_MAX` (default 100, 50-500), since a day built from several people's lists is longer.
- **Plan source.** Saving as a manager marks the plan `MANUAL`, so a later Monthly Plan re-approval does not overwrite it. A missed call still owed from earlier days is added to the manager's list as for an MR.
- **Targets.** A manager has **no target of their own**: their target, achievement and primary are the **sum of every MR in their whole downline** (MRs only, so an MR is never counted once per level above). Derived when read, never stored. Setting a target on a manager is refused (`400`: set it on the MRs). A target already set on a manager is **ignored** (nothing deleted); `pnpm --filter @greynote/api report:manager-targets` lists them. The Sales dashboard shows a manager row as the MRs' total with "n MRs" (or "No MRs under them"); its totals count each MR once. The employee report for a manager adds the MRs' targets (one line per product and run of months) and says how many MRs it adds up (`team.mrCount`). `GET /marketing/targets/:userId` (orders-based) counts only MRs' targets.
- **Transfers.** An MR who moves manager mid-month counts wholly for the manager they have today (the hierarchy is read live; no history).

**Assumed (confirm with the client):** a distributor handed to two MRs of one manager counts for each, so the manager's achievement can exceed what the distributor sold (the manager row is the sum of the MR rows shown under them); a manager with no MR below has no figures ("No MRs under them"), not 0%; a person on leave or off can still be picked (the phone shows their plan status from `team-suggest` and `/team/today`; the server does not refuse); the manager's own doctors owed from earlier days are kept even if the day's routes change.

**Open:** phone app: docs updated, no code. Web has no screen for planning a day (it is phone only). Browser check of the dashboard roll-up.

## 2026-10-14 — Routes are HQ + destination name + a typed km; the map and Google distance are removed

**Decision:**
- **Creating a route is four steps:** choose the HQ, type the destination name, type the km, and see the type (Automatic, from `EX_STATION_MIN_KM` / `OUT_STATION_MIN_KM`, changeable in a dropdown) — then save or edit. No map, no place search, no Google distance call for routes: the client saw very wrong distances, and TA is paid on this number.
- **The route's name is `"<HQ> to <destination>"`**, made by the server (SLG-1 to Naxalbari). Unique per HQ ignoring case, so one route per destination per HQ. A destination edit re-makes it; **renaming an HQ re-names its routes**.
- **The HQ's base place is removed** (it only existed as the origin of the Google distance). An HQ is a name under a Zone; CSV import is unchanged.
- **Removed from Route:** `destination` (map pin), `distanceSource`, `distanceStatus`, `distanceCalculatedAt`, `revision`; the `destination` / `distance` / `recalculate` endpoints and the HQ-rename-of-base-place recalculation report. A km edit is a plain write, last write wins.
- **Kept:** the km is one way and never doubled (D7); the Auto/Manual type with `typeWarning`; the per-route TA rate override; `GET /territory/places/search`, because the doctor / chemist / distributor location picker uses it.
- **Compatibility:** a Route with no km (only one migrated whose Google lookup had failed) still reads `distanceStatus: FAILED` in `RouteSummary` and the phone snapshot, so TA and the phone app did not change; TA flags such a day.
- **Migration:** `pnpm --filter @greynote/api migrate:route-km` (dry run, then `--apply`; manual_deploy Step 9c). Destination = the first part of the old map label; kept distances stay; routes with no km are listed for Admin to fill.

**Supersedes** the 2026-09-24 Google distance decision and the base-place part of 2026-10-03; sign-off D8 is amended.

**Open:** browser check of the new Routes / HQs screens; run the migration on dev and prod; the demo account still carries a placeholder route name.


## 2026-10-14 — The employee can change the day the Monthly Plan wrote

**Decision:**
- **Every field employee can change their Daily Plan's working type, work with and doctors** (`POST /planning/daily/plan`), while the plan is a draft, rejected, withdrawn or reopened. **Routes and remarks are not theirs to change.** **Supersedes** the 2026-10-03 / 2026-10-12 rule that the day is read-only and only the doctors can be picked. An approved or waiting day is still changed through the manager's amend. It also replaces the manager-only `POST /planning/daily/team-plan` of the earlier entry today, and **supersedes that entry's "the manager can edit the routes"**: a manager's routes are set from the people they work with.
- **Routes follow the working type.** Field work and doctor campaign take the Monthly Plan's routes (kept in `plannedFrom` when the day was switched away and back); meeting, conference and strike have none and no doctors (switching clears them; a missed call still owed is kept for a later day). A day the Monthly Plan made a meeting can't become field work (no routes). **A manager who names team members to work with gets those people's routes** (their Daily Plan's, else their Monthly Plan's), with the doctors chosen from the manager's own and those people's on those routes; with nobody named their own monthly routes stand; naming people with no routes that day is refused. A trip's stay and transit days keep their type and routes.
- **The Monthly Plan stays the plan of record.** The first change keeps what it said (`plannedFrom`: type, routes, work with, remarks) and the day reads **"changed from monthly"**; the approval screen shows both, `GET /team/plans` rows carry `changedFromMonthly`. Saving the day back as it was clears the flag. The day is the employee's own (`MANUAL`), so approving the month again does not overwrite it.
- Submit, deadline, resubmit and late rules, approval, the DCR gates and the "Not in plan" flags are unchanged.

**Assumed (confirm with the client):** an approver still decides each day as before (changing the type needs no extra approval of its own); a manager who works with several people gets the union of their routes, not their own; a manager working with someone with no plan that day can't save until they pick someone else or work alone; if the month is approved again after a day was changed, the changed day keeps the employee's version and `plannedFrom` is not refreshed; TA and DA follow the type and routes the plan has when the report is approved.

**Open:** phone app: docs updated, no code. Browser check of the approval preview.

## 2026-10-15 — Discounts on distributor orders

**Decision:**
- **Admin and the Accountant can discount a distributor order**, when they add it for an employee or change it while it is Placed: **per line** (percent, or a flat amount off) and/or **on the whole order** (percent, or a flat amount off). A "partial order" discount is simply line discounts on some lines. **A chemist order never carries a discount** (information only); an employee's own order never does either (ignored).
- **Order of work:** the line discount comes off first; the order discount is worked out on the subtotal after line discounts and shared into the lines in proportion (remainder to the largest line), so every line has a **net** and the order total is the sum of the nets.
- **Net is the value everywhere:** `totalAmountPaise`, primary and secondary achievement, targets roll-ups, reports, distributor dues all use the net. A Done order values each line at its net for the units supplied (net × supplied ÷ ordered, so a flat discount shrinks with a part supply). Free units stay unpriced.
- A flat amount may not exceed its line (or, for the order, the subtotal after line discounts); a percentage is above 0 and at most 100 with at most two decimals. No limit or approval step; the edit trail (`editedBy`, `editedAt`, the kept original order) is the audit.
- The MR sees the discount and the net on the phone, read only.

**Open:** migration not needed (older orders read net = gross); browser and phone check pending.

## 2026-10-15 — Reporting managers: higher designation, covering the HQ, optional

**Decision:**
- **The manager must be at a higher designation**; any higher level is allowed, so a vacant ZSM/NSM level is simply skipped. The API now refuses an equal or lower one.
- **The manager is optional for every designation.** With none, approvals go straight to Admin (HR for leave), as already happened at the top of a chain. No change to approval routing.
- **Coverage per manager** (no Region entity): an ASM or RSM covers a list of HQs, a ZSM covers Zones, the NSM covers everywhere. The manager picker (wizard, profile Work section) lists only managers above the employee's designation who cover the employee's HQ, each shown as "Name (ASM)"; a manager with no coverage yet is still listed, marked "no coverage set". Coverage is eligibility only: approvals and the downline still follow the direct manager.
- The wizard clears a chosen manager when the designation, zone or HQ changes.

**Open:** existing employees whose manager is the same or a lower level are not touched (no migration); browser check pending.

## 2026-10-15 — Push notifications and deadline reminders (backend)

**Decision:**
- **Firebase push, backend only.** Every Inbox message is also pushed to the recipients' phones. The push is a nudge; the Inbox row is the record, so a missed push loses nothing. Without the Firebase key (`FIREBASE_SERVICE_ACCOUNT_JSON`) or with `PUSH_ENABLED` off, nothing is pushed.
- **Tokens live on the session** (`UserSession.pushToken`, `PUT`/`DELETE /identity/auth/push-token`). A logged-out session is never pushed to; a token that moves to another account leaves the old one; Firebase's "not registered" answer clears it.
- **Reminders to employees** before the daily plan (2 h, 30 min, and "missed" at the deadline) and before the monthly plan, expense and stock deadlines (3 days, 1 day, and the morning after). Skipped for leave, weekly offs and holidays (daily plan), before joining, blocked, closed financial years.
- **Reminders to managers**: how many of their whole team have not submitted (daily plan 2 h before and 30 min after; monthly plan and expenses 3 days, 1 day before and after); expense months waiting before the approval cutoff; and a twice-daily "100 daily plans, 10 monthly plans, 5 expenses… waiting" count of direct reports' requests (10:30, 17:00). Counts, not names.
- **Immediate messages** to the employee: request approved or rejected (with the reason), late-submission exception given, unblocked. Existing team alerts and Admin broadcasts push too.
- **One job, claimed stages.** `deadline-reminders` every 5 minutes; each stage fires once across servers (`ReminderMark`); after downtime only the latest due stage is sent. Lead times and digest times are Admin settings (group *Notifications*).
- **Events by an in-process bus** (`shared/events/appEvents.ts`) so Approval and Identity, below the Inbox, can cause a message without importing it.

**Assumed (confirm with the client; sign-off F8):** the MR gets the same stages as the manager; "missed" goes to the employee at the deadline and to the manager 30 minutes later; digest at 10:30 and 17:00; approval counts are direct reports only, submission counts the whole downline; no quiet hours; target set and call assigned do not notify yet.

**Open:** the phone app (token registration, tap routes, foreground banner); a Firebase key on the server; browser/phone check; Admin screen shows the new settings only after the seed is re-run.

## 2026-10-15 — Employee ids are GHC001, GHC002 … for everyone; existing ones renumbered; DEMO accounts removed

**Decision:** one shared counter hands out `GHC` + three digits (GHC001 … GHC999, then GHC1000) to field employees (wizard) and office staff (`/employees/new/staff`, no code field any more; `CreateUser` generates it). Supersedes 2026-10-13. Existing employees, the Admin included, are renumbered once by `migrate:employee-codes` (dry run, then `--apply`): oldest `dateOfJoining` first, then creation time; anyone already on a GHC code keeps it, so it can be re-run; the counter is set to the last number. The old-to-new list is printed. The DEMO accounts (DEMOMGR, DEMOMR1-3, their zone, HQ, route and doctors) are deleted with `seed:demo-manager -- --remove` and no longer created by `seed-production`.

**Consequences:** everyone signs in with the new code (the phone app caches the old one until re-login); the Google Play reviewer's DEMOMR logins stop working; the public delete-account page also asks for the new code.

**Open:** run the demo removal and the migration on dev/prod; then delete `seed-demo-manager.ts` / `demoAccounts.ts` and the `isDemo` handling; tell staff their new codes; browser check.

## 2026-10-15: Team tab on the employee page

The web employee page gets a read-only **Team** tab: the managers above (top down) and the people below (a tree, opened level by level). One route, `GET /identity/users/:id/reporting` (Admin, HR), because `/team/*` only serves a signed-in manager's own downline. Changing the manager stays in Profile → Work, which already enforces "a higher designation"; reassigning from the tab was left out.

## 2026-10-15: Organisation tree is lazy, not paged as a whole

A company-wide tree cannot use page numbers, so each level is its own paged read (`/identity/org/children`) and a branch loads when opened. Search is flat. Reuses the Team tab's person row. Also fixed in the Team tab: the "not active" badge compared the status in capitals and showed on everyone.

## 2026-10-15: Moving a team to a new manager is all-or-nothing, from the current month

Bulk move validates every person with the same rules as a single edit and changes no one if any fails, so a half-moved team never exists. Dated from the current month like a profile edit (no month picker). No notification yet.

## 2026-10-15: Admin forgot-password goes to the owner, by emailed code

Only Admin accounts; the one-time code is emailed to a single owner address, not to the Admin, so the owner decides who is let back in. The owner address (`PASSWORD_RESET_OWNER_EMAIL`) and the cap of 3 codes a day for the whole system (`PASSWORD_RESET_DAILY_LIMIT`) are **server environment**, with the mail credentials. A first version kept the two as Settings; changed because the people who run the server, not an Admin in the portal, should control where account-recovery codes go. Trade-off accepted: a stranger who finds the page can use up the day's codes for a real Admin (limited by 5 tries per 15 min per address and only counted for real Admin IDs). Gmail SMTP behind `MailerPort` so it can change later.

## 2026-10-22: Inbox attachments are uploaded with the message, and the body has no limit

**Decision:** files travel in the same multipart request as the message (`payload` JSON + `files`), not through a separate upload first, so there are never orphaned files from a message that was not sent; everything is validated before the first upload, and a failure removes what was stored. Up to 5 files, 10 MB each, PDF / JPG / PNG / WebP / DOCX / XLSX / PPTX, type from the bytes; video was left out (size on field phones' data, Cloudinary quota). Each file has `url` and `downloadUrl` (Cloudinary `fl_attachment`); Documents got `downloadUrl` too. Taking a message back deletes its files. The 2,000-character body limit is removed at the client's request: only the 2 MB request size stops it. Because the body is copied onto every receipt, a very long message costs one copy per recipient; accepted. The push shows a 180-character preview (Firebase's 4 KB limit).

**Open:** the field app (another team) adds the attachment rows, Open/Download and long-text display from `mobile/inbox.md` and Download on `mobile/docs.md`; Cloudinary account must allow PDF delivery (already needed by Documents); browser check.

## 2026-10-22: Weekly off and holidays are locked on the Monthly Plan, worked out rather than stored

**Decision:** an employee can't plan their weekly off or a holiday of their **main HQ** (National, that HQ's, its Zone's). The locked days are read from HR each time (`listPlanOffDays`) instead of being written into the plan as a `HOLIDAY` working type, so a holiday HR adds or removes later is reflected at once; save and submit both check, and approval writes no Daily Plan for them. A manager's day is locked only by their own HQ's holidays, not by every HQ they cover (a Siliguri-only holiday shouldn't take a ZSM's working day); leave counting keeps the wider rule, so the two differ on purpose. The weekly off is locked too, at the client's request. A Daily Plan already written for a day that later becomes a holiday is kept; the day doesn't count as missed anyway. HR shares Planning's tier, so the list is bound in by the composition root (`planning.bindOffDays`), like Field Master Data's doctors.

**Open:** the field app shows the locked days (`mobile/monthlyplan.md` rule 18); plans saved before this keep any Sunday/holiday entries until their next save or submit; browser check.

## 2026-10-22: Doctors can be deleted for good (archived), and deactivated in one step

**Decision:** Admin only, on the web (no requests from the phone). Before deactivating or deleting, the web shows what it touches. **Deactivate** ends the MR's assignment in the same transaction instead of refusing until Admin unassigns. **Delete** copies the doctor to `doctorarchives`, removes it and its assignments, and touches nothing else: calls, gifts, services, sample allocations, visual picks and submitted plans keep the id, and `getDoctor` answers from the archive as `inactive`, so history keeps the name and new writes are refused (the pattern of the 2026-10-16 territory delete). Open gifts and services are listed, not closed. An inactive doctor can now be edited.

**Also fixed:** an MR losing a doctor (unassign, reassign, deactivate, delete) left it on their draft Daily Plans, whose next submit was then refused ("isn't one of your doctors"). Planning now takes it off the plans from today that are still editable; submitted and approved ones keep it. And Admin could allocate a gift to an inactive doctor (only its existence was checked); that is now `409`, which also covers a deleted doctor answered from the archive.

**Open:** browser check; the field app follows `mobile/doctors.md` 2a (mostly existing behaviour).

## 2026-10-22: Targets are edited in place, and an edit never merges two targets

**Decision:** a target can be edited (`PATCH /marketing/targets/:id`): months, product (or all products) and amount or units; the employee can't change (that's another person's target). Before, the only change was re-setting the exact same product and months, and anything else made a second target beside the old one. If an edit would land on another target's product and months, it is refused (`409 TARGET_CLASH`) rather than merged, so no amount disappears silently. The web puts Edit on each row of the employee's Targets table.

## 2026-10-22: A minimum gap between visits to a doctor; visit frequency at most 4; the coverage-wait setting removed

**Decision:** a new Admin setting `DOCTOR_VISIT_GAP_DAYS` (default 8, 0–9): after a doctor call or doctor follow-up, the same employee can't record another call or follow-up on that doctor for that many days (both directions, so an out-of-order push is caught too). Per employee rather than per doctor, so a manager's joint visit with the MR can be recorded. Enforced at sync (`DOCTOR_VISIT_TOO_SOON`); the phone can pre-check from its own records. The cap of 9 keeps 4 visits possible in February. A doctor's visit frequency is now 1–4 (`MAX_VISIT_FREQUENCY`), since more can't fit with the gap; existing 5s are moved to 4 by `migrate:doctor-visits`. Sync refusals gained an optional `details` map so the phone gets the dates as data.

**Also:** `NEW_DOCTOR_COVERAGE_WAIT_DAYS` (client sign-off C7) was removed. It was defined and seeded but never read, and it was being mistaken for the visit gap. The doctor's approval date is still stored, so the coverage wait can be added back with coverage reporting.

**Open:** run `migrate:doctor-visits` on dev and production; the field app adds the pre-check and the 1–4 picker; browser check.

## 2026-10-22: Deactivating an employee hands everything over, and signs them out at once

**Decision:** deactivation is no longer an edit (`PATCH status`) but its own Admin action with a **last working day** (today or earlier; no scheduling). A manager's team must be moved to an active new manager in the same step (their own manager suggested), so no request is left waiting on someone who can't sign in. Their doctors go to a chosen colleague where that person has the route, else unassigned; routes and coverage end (the main HQ stays on record); distributors drop them; their plans and leave after the last day that still wait are rejected; targets past the leaving month are cut, keeping their share. Each part is reported and can be re-run. Access tokens issued before the deactivation are refused immediately (an in-memory list, re-filled on restart), not after up to 15 minutes. Payroll pays a leaver up to the leaving month in full, like joining, with `leftInMonth`; days after it are `NOT_EMPLOYED`. Admin can reactivate a rehire from a rejoining date; nothing handed over is restored. A deactivated person can't be made a manager.

**Open:** a final-settlement proration rule if the client wants one (today: full month, HR adjusts); browser check.

## 2026-10-23: A manager can edit a monthly plan that is waiting for them

**Decision:** a manager above the employee, or Admin, can change **any day** of a `SUBMITTED` Monthly Plan (`PATCH /planning/monthly/:id/amend`) instead of rejecting it for a small fix. A reason is required, the replaced days are kept in `amendments`, the plan stays `SUBMITTED` for the manager to decide, and the employee is told by push (`monthly.plan.amended` → `PLAN_AMENDED_MONTHLY_PLAN`). The days are checked like the employee's own save and submit; the trip and next-month logic is shared (`MonthlyPlanWriter`). Once the manager has approved it (`MANAGER_APPROVED`, `APPROVED`) the plan is frozen again and only an Admin reopen changes it, so an edit never has to be chased into the Daily Plans (they are written at manager approval). The employee only hears about it; they don't acknowledge it. Modelled on the manager's amend of a Daily Plan.

**Also:** `GET /planning/monthly/:id/routes` lists the owner's active routes for the manager's picker, readable by whoever can read the plan and only through a plan (the territory endpoint is Admin/HR only).

**Open:** the phone app builds the edit screen (`mobile/monthlyplan.md` section 6).

## 2026-10-23: Doctors get an optional profile photo

**Decision:** a doctor can have one optional photo (JPG, PNG or WebP, up to 5 MB, stored by Cloudinary at 512×512), shown as an avatar in the Doctors table and the approval preview, with initials when there is none. It is a nullable `photo {url, publicId}`, so the many existing doctors need no migration. Admin sets or removes it on the web (add and edit form); the MR who added a doctor can also set it from the phone, **after** the add has synced (the add stays JSON so it works offline), and only until the request is approved. The photo is not part of the approval, so changing it does not resubmit. Replacing or removing deletes the old file; deleting a doctor deletes its file and the archive keeps none. Clients only get `photoUrl`. The upload middleware, file check and Cloudinary adapter moved from Identity to `shared/` so both modules use them. The phone app is not changed here; `docs/mobile/doctors.md` (rule 10, section 6) is the contract.

**Open:** the phone app building the picker and the queued upload; whether the approver (a manager) should be able to replace the photo during review (today only Admin and the adding MR can).

## 2026-10-24: HR can approve and reopen plans, like Admin

**Decision:** HR can decide a Daily or Monthly plan at any stage, ahead of the manager (`ADMIN_OVERRIDE`, and that approval is final), see them in its Approvals queue and Reviewed list, and reopen an approved plan. A kind opts in with `overrideRoles` when it registers; Admin always may. Leave does not opt in, so it stays manager, then HR or Admin. Every other kind stays Admin only. No migration.

**Open:** whether HR should also override Daily report, Monthly expenses (the PRD gives expense auditing to the Accountant), New doctor and Doctor service.

## 2026-10-24: HR sets targets; managers only view them

**Decision:** Only Admin and HR set, edit or remove Targets (`POST`, `PATCH`, `DELETE /marketing/targets`); a manager can no longer set them for their team, and a plain MR never could. Managers still read their team's targets and the Sales dashboard (downline only). HR gets the Sales dashboard and the employee view org-wide, like the Accountant, and sets targets there; HR does not enter secondary figures or adjust the primary (still Admin and managers). A manager still has no target of their own. This supersedes the earlier "Admin or a manager sets Targets" entries and makes "manager changes to MR targets bypass approval" moot.

**Open:** the phone app still shows Set and Remove to managers and must drop them (`docs/mobile/secondary-and-targets.md`); the app is another team's.

## 2026-10-24: An MR's order is priced at PTS or PTR, never the MRP

**Decision:** The server prices an MR's own order (`POST /sales/orders` and the `ORDER` sync) from the catalogue: the product's **PTS for a distributor, PTR for a chemist**, whatever unit price the phone sent. The phone's price is only a preview. A product with no PTS or PTR keeps the price it was sent. Admin and the Accountant, adding an order for an employee or editing a `PLACED` one, still type the price they want. Cause: a phone with a stale catalogue falls back to the MRP, so a distributor order was valued at the MRP (RENAL PHARMA, ENTRAIL HP, 30 × ₹1,159 instead of ₹794). Orders already saved at the MRP are repriced by `pnpm --filter @greynote/api migrate:mrp-orders` (dry run first, then `-- --apply`); it skips cancelled orders and ones the office has edited, and keeps the first lines in `originalItems`.

**Open:** the phone still lets the MR edit the price box and shows its own total; it should show the server's total after sync (`docs/mobile/orders-and-stock.md`). The app is another team's.

## 2026-10-24: Accountant: products for orders, no payroll or pay structure screens; HR edits holidays

**Decision:** (1) The Accountant may read the product list (`GET /field-master-data/products`, `/:id`; writes stay Admin) so the product picker in Add and Edit order fills. (2) The order form's discount types read "Percentage (%) discount" and "Rupees (₹) discount". (3) Payroll, Pay grades and Pay components leave the Accountant's navigation and cannot be opened by URL (Admin and HR keep them), and the dashboard's payroll tile goes with them; the Accountant's payroll API roles (generate, finalize, pay) are unchanged for now. (4) HR manages the holiday list fully: `PATCH /hr/holidays/:id` (ADMIN, HR) replaces a holiday, or with `group=true` every day of its range, with the fields sent (new days are checked and written first, then the old ones removed); `POST /hr/holidays/import` is open to HR as well as Admin.

**Open:** the Accountant can still call the payroll API; remove it if payroll is to be HR and Admin only.


## 2026-10-25: Admin and HR edit an approved Monthly Plan; Admin deletes a future month; reason optional

**Decision:** (1) Admin and HR can change a `MANAGER_APPROVED` or `APPROVED` Monthly Plan through the amend endpoint, for **days after today only**; the approval stays, the old days are kept in `amendments`, the employee is told. A trip that has begun can only get a new return date (tomorrow or later); its stay and transit days up to today cannot change. The Daily Plans written from the month follow, but if the employee changed, sent or had a day amended, the whole edit is refused naming those days. (2) Admin only can delete a month that has not started (plan, approval, unsent Daily Plans; hard delete, in one transaction); HR can edit but not delete. (3) The reason on an amend (monthly and daily) is optional. (4) HR can read plans and amend a Daily Plan like Admin; an approved day only after today. (5) A reopened request is listed under Reviewed (status "Reopened"), where Admin finds it after a reopen; it is not in Waiting because it waits on the employee. (6) Review screens: route names without the HQ, a stay or transit day and the day a trip starts get gray tags, the trip return date is asked only with an out-station route, route types are shown in the picker, a trip about to be saved is confirmed day by day, and Save applies a day left open in the form. The back link returns to the tab the request came from.

**Consequences:** the employee's push says only who edited the plan when no reason was given; `routes` and `amendments[].reason` may be empty. The phone must show amendments without a reason.

**Open:** the phone app has built none of the amend screens' new rules (`docs/mobile/monthlyplan.md` rules 20 and 21); the web "today" for locking days uses the browser date, the server's business date decides.

## 2026-10-25: Admins have their own codes, ADMIN01, ADMIN02 …

**Decision:** a new Admin gets `ADMIN` + two digits from its own counter (`adminCode`); everyone else stays on the `GHC` counter. `migrate:admin-codes` (dry run, then `--apply`) renames existing Admins oldest first; `migrate:employee-codes` leaves ADMIN codes alone. Supersedes the "Admin included" part of 2026-10-15.

**Consequences:** the Admin signs in with the new code (GHC015 becomes ADMIN01).

**Open:** the migration has been dry-run but not yet applied to the database.

## 2026-10-26: Downloaded files are named after the person, their designation and the period

**Decision:** a CSV about one employee is called `<name>-<designation>-<what>-<period>-<code>.csv`, lower case, `-` only: `rahul-roy-mr-monthly-plan-2026-11-emp03.csv`, `rahul-roy-asm-dcr-2026-02-12-emp03.csv`, `rahul-roy-mr-doctors-emp03.csv`. The period is `YYYY-MM-DD` for a day, `YYYY-MM` for a month, `2026-27` for a financial year, and absent for a list. ISO dates, not `12-02-2026`, so files sort in a folder and `12-02` is never read as 2 December. The full name (two Rahuls are common) and the employee code at the end (same name and designation must not overwrite each other). Web: every per-employee download (approvals, Employee page, Monthly Plan, TA/DA days, doctors not visited). Org-wide files (payroll, sales, `dcr-employees-…`, all doctors) have no single owner and keep their names.

**Consequences:** a manager saving a team's files can tell them apart without opening them. The web builds the name from the user and the designation list (`lib/exportFilename.ts`); the approvals file for a request is named after the submitter. The old `<what>-<code>-<period>.csv` names are gone.

**Open:** the phone still names Tour Plan and Expenses files `tour-plan-<code>-<month>.csv` (`monthlyplan.md` rule 22, `expenses.md` rule 11, `team.md` section 6); the mobile side builds the change, this repo did not touch `apps/fieldApp`.

## 2026-10-27: Done needs an invoice number; payments are allocated to invoices; invoices print from the browser

**Decision:** the office (Admin or the Accountant) marks a distributor order Done and must give the **invoice number** (unique, up to 30 characters); the MR can no longer mark an order Done (they keep Cancel). The GST invoice is frozen on the order at that moment: supplied lines (prices are ex-GST) plus GST at each product's rate, rounded to the rupee. A payment can be **allocated across several invoices** (an amount against each; the rest stays on account), so each invoice has paid and due. A new **Invoices** page lists them (date, distributor, total, paid, due, status), and an invoice **prints from the browser** as a Tax Invoice laid out like the one the company issues today (`Sale_3452`), with the seller block hard-coded; no PDF is uploaded or stored.

**Why:** the office raises invoices in another tool and had no way to say which invoice a payment settled. Storing the PDF was not wanted; a printable page from the data the app already holds is enough.

**Consequences:** a Done order's amount in dues is now its invoice total (with GST), not its supplied amount, for orders marked Done from now on; older Done orders keep the supplied amount until the office gives them a number. The field app must remove its Done button (docs/mobile/orders-and-stock.md).

**Open:** HSN, batch, expiry and the buyer's FSSAI are not stored, so the printout omits them (HSN, batch and expiry are added on 2026-10-28; the buyer's FSSAI is still open); two payments recorded at the same instant could over-allocate one invoice (checked at record time only); whether older Done orders should be given invoice numbers in bulk.

## 2026-10-28: HSN/SAC, batch and expiry on each invoice line

**Decision:** the Tax Invoice prints **HSN/SAC**, **Batch No.** and **Exp. Date** per item, as in the company's own invoice (`Sale_3452`). HSN/SAC is a new product field (4 to 8 digits, required on a new product); it is copied onto the order line when the office marks the order Done, so editing a product later never changes an issued invoice. Batch and expiry (`MM/YYYY` typed, kept as `YYYY-MM`) are typed per line in the Mark Done form; one batch per line, so a product from two batches is two lines. They are required on every line with units supplied (or free); a line with nothing delivered needs none. Done is refused (400) while a delivered line lacks them or its product has no HSN.

**Why:** a GST and drug-licence invoice carries them, and the office was adding them by hand in the other tool.

**Consequences:** a plain Done with no form no longer exists: every delivered line must be named with its batch and expiry. A product with no HSN cannot be delivered until the office sets one in Products. Invoices from before this show a dash in the three columns. No migration: old orders and products read the new fields as null.

**Open:** several batches inside one line; a PTR column (the company's invoice has one); a bulk HSN backfill for existing products (the office edits them by hand for now); the field app's product screens do not show HSN (the sync snapshot is unchanged).

## 2026-10-28: Admin setting: can managers add doctors

**Decision:** a system setting, **Managers can add doctors** (`MANAGER_CAN_ADD_DOCTORS`), default **off**. A manager is anyone with a team under them. Off, `POST /doctors/added`, the `NEW_DOCTOR` sync record and a resubmit all refuse a manager (403; sync code `MANAGER_NOT_ALLOWED`). On, the doctor is pending and goes to the manager's own manager or Admin, as for an MR.

**Why:** the docs said managers cannot add doctors, but the API only checked that the caller had routes. Admin wants to decide per company.

**Consequences:** read on every call, so switching it off applies at once. A retry of a doctor the manager already added still returns it. The field app should hide Add for managers when off; that is the other team's change.

## 2026-10-28: Automatic notifications are cleared and auto-deleted

**Decision:** system notifications (no sender: "sent a new doctor", "approved", team summaries) are deleted for good after **`INBOX_NOTIFICATION_RETENTION_DAYS`** (default 7, 0 = never) by a job every 6 hours, and the Admin can clear one or all on the Inbox screen (new Mail / Notifications / All tabs). Admin mail keeps today's take-back (row stays as "Taken back") and is never auto-deleted.

**Why:** they filled the Admin's list (1,200+ rows) and were never physically removed.

**Consequences:** clearing removes the notification from people's phones too. Deleted rows leave no record. The field app needs no change: they vanish from the next fetch.


## 2026-10-30 — Routes are only what is stored

**Problem:** adding an HQ on the employee page saved no routes, yet the Routes card listed every route of that HQ (read-time fallback). Remove failed with "not assigned" and the route's Assigned card was empty.

**Decision (owner):** no auto-selection. A route belongs to an employee only when ticked and stored. Ticks come with "all of a Zone", "all of an HQ" and "everything shown".

**Consequences:** `ListRoutesForUserUseCase` reads stored assignments only, so Planning's picker, call checks, mobile sync, doctor visibility and distributor scope see exactly the stored routes. Existing MR/ASM/RSM who relied on the fallback are backfilled with `migrate:explicit-routes` (run before or with the deploy; ASM/RSM included). ZSM/NSM hold no routes and are unaffected. A route created later is still added by hand (the Routes card reminder stays). The phone app needs no change. Removing an HQ on the Territory card ends that HQ's route rows in the same save.

## 2026-10-30 — Choosing a manager offers to extend their territory

**Problem:** a manager whose coverage lacked the MR's HQ was hidden from the picker, so the territory had to be fixed on another screen first; and a manager given an MR never got that MR's routes.

**Decision (owner):** when a manager is chosen, offer (not silently apply) the MR's Zone/HQ and, for ASM/RSM, the MR's routes, all changeable. ZSM/NSM keep holding no routes. Union only, never removes, does not follow later changes.

**Consequences:** `coverage: 'missing'` managers are listed last. New `POST /territory/users/:userId/extend-territory`. A manager given routes can plan and call on them and shows on those routes' Assigned card; doctor visibility and distributor scope for them widen accordingly. Bulk Move reports and promotions do not offer it yet.

## 2026-10-30 — NSM saves Zones; fixing existing managers from the UI

**Decision (owner):** the NSM gets Zones saved like a ZSM when chosen as a manager (no routes). Existing managers that lack what their direct reports cover/hold are fixed in the app, not by a script: a **Territory gaps** screen plus banners on the manager's own Routes and Territory cards.

**Consequences:** an NSM with Zones saved no longer means "every Zone": their zone-specific holidays follow those Zones only (national holidays unchanged); the confirm step warns. Gaps look at direct reports only (fix a deep tree level by level). Applying is union only and idempotent.

## 2026-10-31 — Employees add Chemists, with their own manager toggle

**Decision (owner):** employees add Chemists from the phone with their location, like Doctors: created `pending`, approved by the manager or Admin. A manager may add only while new setting `MANAGER_CAN_ADD_CHEMISTS` is on (default off). It is separate from `MANAGER_CAN_ADD_DOCTORS`. Both flags are now sent in `GET /config/public` (`managerCanAddDoctors`, `managerCanAddChemists`) so the phone can hide the button; this closes the server side of gap A2/C in `docs/mobile/field-app-gaps.md`.

**Consequences:** new `NEW_CHEMIST` approval kind and sync record kind; Chemist gains a `pending` status, `addedBy`, `clientRequestId`, `capturedLocation`, `approvedAt`. Pending Chemists are invisible to calls, orders and stock until approved. The phone work is the field-app team's; the contract is in `docs/mobile/chemists.md`.

## 2026-11-02 — Leave can be requested and approved for past dates; only a finalized salary stops it

**Decision (owner):** an employee may apply for leave on past dates, and a manager or HR may approve it after its first day. The only stop is the payslip: once an employee's salary for that month is finalized, the leave cannot be requested, edited, approved or reopened (`PAYROLL_FINALIZED`, unchanged).

**Reverses:** the 2026-10-12 rules that a leave cannot start in the past (`LEAVE_BACKDATE_DAYS` 0) and can only be approved until its first day.

**Consequences:** removed the approval cutoff, the Admin late-approval exception (`/hr/leaves/:id/approval-grant`, the web button, `LATE_LEAVE_GRANT_*`), the auto-reject job and the `LEAVE_BACKDATE_DAYS` setting. A past date still has to be inside the current or next leave year (the earlier leave year is closed) and an open financial year. Only a finalized salary locks the month; a draft does not, so HR regenerates the draft to pick a late leave up. The phone's sync field `leaveBackdateDays` stays, fixed at 366, so older builds still work. The phone work (drop the "today or later" date limit, drop the late-approval messages) is the field-app team's: [`mobile/leave.md`](mobile/leave.md).

## 2026-11-02 — Doctor Services are open to every employee, inside their own scope

**Decision (owner):** any employee may request a Doctor Service whatever their designation, not only the assigned MR. The doctor must be in their own scope: an MR's own doctor, or a doctor assigned to anyone below a manager in their team. A request goes to the requester's own manager; the NSM, who has none, goes to Admin. The service counts as the requester's spend, not the doctor's assigned MR's.

**Consequences:** `CallChecks.serviceDoctor` replaces the "assigned to this doctor" check for the `DOCTOR_SERVICE` sync kind only; calls, samples and gifts keep the assignment rule. The refusal code stays `DOCTOR_NOT_ASSIGNED` with a new message. The approval module already sent a manager-less submitter to Admin, so it needed no change. The web Doctor services list still has no "requested by" column; adding one means a `userName` on the list rows. The phone work (let a manager open the form and pick team doctors) is the field-app team's: [`mobile/service-requests.md`](mobile/service-requests.md).

## 2026-11-02 — Files on an employee's monthly secondary

**Decision (owner):** an employee's monthly secondary can carry photos or PDFs as proof of the figures, any number per month, with no cap on how many. Optional: sending the month for approval does not need one.

**Consequences:** each file is its own record (collection `secondaryattachments`) tied to the employee and the month, so two uploads at once never overwrite each other. The kept limits are 5 MB a file and PDF/JPG/PNG, read from the file's own bytes. The employee can add and remove while the month is a draft or rejected; their own files freeze when it is pending or approved. A manager for their team, or Admin, can change them at any status, inside the same month window as the figures. The approver sees the files on the approval card, and the web month grid shows and edits them. New endpoints `POST` and `DELETE /sales/employee-secondary/attachments`, and `attachments[]` on `GET /sales/employee-sales`. Phone work is the field-app team's: [`mobile/secondary-and-targets.md`](mobile/secondary-and-targets.md) section 1b. Files are not removed when an employee is deleted; the reset script and a future cleanup would need to include them.

## 2026-11-02 — Greynote logo on the payslip; searchable dropdowns and reports; doctors found by MR name

**Decision (owner):** the payslip shows the Greynote logo (`/brand/logo.png`) in place of the text `GREYNOTE`; the company name heading stays. Reports can be searched by name: the DCR report and Doctor visits get a search box, and the long lists in dropdowns (distributors, products, zones, HQs, the order and target pickers) become searchable. The Doctors list and the doctor pickers find a doctor by the doctor's name **or** the name or employee code of the MR they are assigned to, in one box.

**Consequences:** the doctor search is done on the server, because the lists are paged: it looks up the employees whose name or code matches, then adds the doctors assigned to them (`DoctorFilter.alsoDoctorIds` for the all-doctors list, `alsoUserIds` for the assigned lists, which restrict the employee match to the people in view). Doctor visits searches an employee by name or code, or by the name of any of their doctors. Small fixed dropdowns (status, month, type) stay plain. Phone: only the label of the team doctor list's search box ([`mobile/doctors.md`](mobile/doctors.md)).

## 2026-11-02 — MR filter on the Doctors list

**Decision (owner):** the Doctors list gets the same MR filter the Distributors list has: an "Anyone assigned" button that opens the employee picker, plus an **Unassigned** button for doctors nobody is assigned to. Only the filter; the doctor pickers elsewhere stay as they are.

**Consequences:** `GET /field-master-data/doctors` takes `assignedUserId` (the employee's active assignments) or `unassigned=true`, not both (`400`). They combine with the route, status and search filters and keep paging correct. The CSV download uses the same filters. Admin web only; the phone's own `mine` and `team` lists are unchanged.

## 2026-11-02 — One late-grant model for every deadline; settled periods are closed to late entries

**Decision (owner):** late-submission exceptions are one thing, not three. `/late-submissions` grants an exception for any deadline-bearing item — daily plan, monthly plan, expenses (send or approve), monthly stock count, secondary sales and their files — each for one employee and one period. A late entry is **refused once the money for the period is settled**: a plan once the month's salary run is finalized or any of its expenses are finalized or paid; an expense exception once the month is finalized or paid. Admin's month-wide stock unlock stays; a per-employee grant now works beside it. The month cannot be picked in browsers without a month input, so the grant form uses a year and month list.

**Consequences:** [`LLD/lateGrants.md`](LLD/lateGrants.md). One `lategrants` collection (`migrate:late-grants` copies the plan and expense grants across; run it before deploying). Plans' and expenses' own endpoints (`/planning/late-grants`, `/field-activity/expense-grants`) keep working over the same store. The check runs when granting and again when the exception is used, and finalizing payroll or expenses ends any exception still open for that month. Plan exceptions and expense approvals/sends are spent by use; stock and secondary exceptions last until they end, since a month is many entries. Config: managers may grant stock exceptions only where `LATE_STOCK_GRANT_BY_MANAGER` is on. The phone's plan and expense fields (`lateSubmitAllowedUntil`, `exceptions`) are unchanged ([`mobile/`](mobile/)).

## 2026-11-03 — Managers plan and call on any downline doctor

**Decision (owner):** a doctor is assigned to one MR, but a manager acts as the caller of every doctor below them. A manager's Daily Plan may list a doctor assigned to anyone in their whole downline, on any route, without naming that person in Work With, and the manager can record the call.

**Consequences:** `ManagerScope.doctorScope` uses the downline for a manager and drops the route check (`anyRoute`); carry-over of owed doctors uses the same people; `CallChecks.doctor` accepts a downline doctor (as `serviceDoctor` already did); releasing a doctor now clears every editable plan listing it, so a manager's draft loses a doctor moved off the team. The cap `MANAGER_MAX_DOCTORS` stays. Not done: the phone snapshot's `doctors` is still the caller's own; the phone reads a manager's downline doctors from `GET /field-master-data/doctors/team` until a snapshot list is added.

## 2026-11-03 — Sales report by product, distributor and employee, for a month, quarter or year

**Decision (owner):** the Sales report was a distributor-and-product stock statement and too cluttered. It now has three roll-ups, each one dimension at a time: **by product** (with target and achievement), **by distributor** (products added up), **by employee** (target, primary, achieved, %). Each reads a **month, a quarter or the whole year** of the financial year in view. The old statement stays as a "Stock statement" tab. Open to Admin, Accountant and HR; a manager reads the by-employee roll-up for their downline. CSV only. Targets stay per employee: a product's target is the sum of its employees'; there are no distributor targets.

**Consequences:** `GET /reports/sales/by-product`, `/by-distributor`, `/by-employee` (`year`, `period=month|quarter|year`, `month` or `quarter`), from the same statement rows as `/reports/sales/statement`, so they agree with it. Because a distributor shared by two employees counts in full for each (sign-off M5), employee rows can add up to more than the total; the total counts each MR once. The sign-off rows K24 (Admin only) and K27 (by month only) are superseded for this report. The phone is unchanged.

## 2026-11-04 — Monthly cutoff for the daily report; late only by Admin

**Decision (owner):** a day's report (its calls, follow-ups and the final submit) must be in by `DCR_SUBMIT_CUTOFF_DAY` of the **following month** (the end of that business day, so it follows `DAY_START_TIME`). After it, the day is refused with `DCR_SUBMIT_LATE` unless **Admin** has allowed it late: the same exception as a late Daily Plan, but a manager cannot grant it and there is no `*_GRANT_BY_MANAGER` setting. `0` (the seeded default) means no deadline, so nothing changes until Admin turns it on.

**Consequences:** new late-grant kind `DCR_SUBMIT`, named by the report date (`YYYY-MM-DD`), group **Reports** on `/late-submissions`; its length is `LATE_DCR_GRANT_VALID_HOURS` (24) up to `LATE_DCR_GRANT_MAX_HOURS` (336). Unlike a daily plan, its end is not cut at the end of the day, because the day is already over (registry flag `endsWithDay`). It is spent once, by the final submit, in the sync transaction; the day's calls need only that a usable exception exists. Like the plans, it is closed once payroll for the month is finalized or its expenses are paid. The missed-DCR block is unchanged: a day past its cutoff can still count as missed; Admin unblocks, then allows the day.

**Rejected:** a per-month exception (one use would open only one day); letting managers grant it (owner: Admin only).

## 2026-11-05 — Daily-report deadline matches the salary day; a finalized salary locks the month's reports

**Decision (owner):** the deadline day is the **1st** and is read **before that day begins**: October's reports are due by the end of 31 October (per `DAY_START_TIME`), so the salary run on the 1st (`SALARY_RUN_DAY`) works on settled data. This amends 2026-11-04, where the deadline was the *end* of the cutoff day. Once an employee's payroll run for a month is **finalized**, nothing in that month's daily reports can change.

**Consequences:** `DCR_SUBMIT_CUTOFF_DAY` now defaults to **1** (0 = off) and cannot be set later than `SALARY_RUN_DAY` (either setting is refused if it would break that, `400`). The last day of a month must therefore be submitted that same day. Finalized month: new calls, follow-ups, expenses and the submit are refused with `PAYROLL_FINALIZED`; removing a record, and approving, rejecting, withdrawing or reopening a report, answer `409 PAYROLL_FINALIZED` (the decision is rolled back); a late exception cannot be granted or spent. **Payroll will not finalize a run until the month's deadline has passed** (`409 DCR_WINDOW_OPEN`), so finalizing never locks out an employee who still has time. Payroll has no un-finalize, so the lock is permanent.

**Cost:** a report still waiting for the manager when its month is finalized can no longer be approved or rejected, so its TA/DA is never generated. Managers should decide before the salary run.

## 2026-11-05 — Dashboard sales charts: target vs achievement, top achievers, top products

**Decision (owner):** the Admin, HR and Accountant dashboard gets a sales section for the financial year in view (or a month or quarter of it): an overall donut of target against achieved (the sum of every employee's target, so all-products targets count), a donut per product and per employee (picked from those with a target), the top five achievers as bars, a pie of the top five products' share of sales (the rest as "Others"), and a full list of products and of employees from most sales to least. The dashboard's "waiting for approval" list is removed (the approvals tile stays). This reverses the 2026-10-01 deferral of charts. "Top prospects" was read as **top products** by secondary sales; the codebase has no prospect or lead concept.

**Consequences:** no new endpoint. The charts read `/reports/sales/by-product` and `/reports/sales/by-employee`, so their figures are the report's; each chart has its own query and fails alone. Achieved is the secondary of the employee's assigned distributors (2026-10-14), so a distributor shared by two employees counts fully for each and per-employee figures need not add up to the overall. Drawn with `recharts`. Managers do not see it: the by-product report is org-wide only and refuses them.

**Rejected:** hand-drawn SVG (the existing charts) for the new ones; a downline-scoped by-product report for managers (later, if wanted).

## 2026-11-05 — Sales report: owner overview, month-by-month trend, Excel download

**Decision (owner):** the Sales report opens on an **Overview** tab: the organisation against target for the financial year (achieved, % of target, top employee, top product, how many employees and products are behind target), then every employee or product month by month or quarter by quarter with a year total, sortable by any column. Every table on the page can be downloaded as **Excel** as well as CSV. The product and employee tables now open most-sold-first and sort by any figure; an employee's name opens their daily detail (`/reports/sales-dashboard/:id`). The dashboard's sales section links to the report.

**Consequences:** no new endpoint: each month (or quarter) column is an ordinary `by-product` / `by-employee` request plus one for the year (13 requests, or 5 for quarters, only for the kind on screen, cached like the other tabs). Employee figures keep the 2026-10-14 rule: a distributor shared by two employees counts in full for each. Excel is written in the browser (`write-excel-file`); money is a rupee number, text is always text.

**Rejected:** a single "all months" endpoint for now (worth adding if the 13 requests prove slow); a product × employee matrix (the employee's detail page already answers "what did this person sell").

## 2026-11-05 — Secondary sales is entered by the MR, per distributor and product, in units

**Decision (owner):** the Secondary Sales screen becomes a distributor-wise grid of **Opening, Primary (received), Secondary (issued) and Closing**, all in units, with the value in rupees shown as units × PTS and totals under it. Closing is derived (`opening + primary − issued`). The MR can save a draft and submit; the manager approves. **Only an MR enters**; a manager never does. Opening defaults to the MR's previous approved month's closing (editable); primary defaults to the MR's own Done orders (editable); both flag a difference to the manager. A manager sees the **approved** rows of the MRs below them, summed by distributor and product, with each MR under the row and the totals in units and rupees.

**Consequences:** every figure is the **MR's own slice**, stored per MR (`SecondaryStockLine`, unique on user + distributor + product + month), so a distributor shared by two MRs adds up once: MR-A issued 2 + MR-B issued 4 = 6, never 4 + 2 + 6. A manager's total is the sum of MR rows only (no manager rows, no junior manager's roll-up on top). Achievement credits each approved row's issued units at PTS to its MR alone; a distributor-month that has MR rows no longer counts by assignment, and months without them behave as before. The approval reuses the `STOCK_COUNT` kind (record `userId:month`), the month window and the late-exception gates. New: `POST/GET /sales/secondary-stock`, `POST /sales/secondary-stock/submit`, `GET /sales/secondary-report`, error `MR_ONLY`. The phone spec is in `docs/mobile/secondary-and-targets.md`; the field app is another team's. This supersedes the 2026-11-04 two-tab layout for MRs.

**Rejected:** one shared statement per distributor with a single owning MR (the owner chose per-MR rows, so each MR's own figures stay separate); a read-only primary from orders (the distributor can receive goods outside the app).

**Open:** whether Admin's distributor statement should still override MR-entered figures in the manager report; migrating older `MonthlyStock` counts into the new rows. Note also the 2026-10-12 entry says units × PTR; since 2026-10-14 the figure is PTS.

## 2026-11-05 — Secondary submission needs a proof file; the attach button is renamed and highlighted

**Decision (owner):** an MR cannot submit a month of secondary stock without at least one attached file (photo or PDF of the distributor's statement). The button reads **Attachment File** (was "Add files") and is the primary, highlighted style, because the old secondary-coloured one was not noticed.

**Consequences:** `POST /sales/secondary-stock/submit` answers `409 ATTACHMENT_REQUIRED` when the month has no file (an empty month still answers `SECONDARY_NOTHING_TO_SEND`). `GET /sales/secondary-stock` returns `attachments[]` and `attachmentCount`, and the web approval card lists the files. The files now also freeze for the MR once the per-distributor rows are `PENDING` or `APPROVED`; before, only the older per-product entry froze them, so a file could be removed after submitting. A manager or Admin may still change them. Months already sent are unaffected; the retired per-product send keeps files optional. Phone work is in `docs/mobile/secondary-and-targets.md`; the field app is another team's.

## 2026-11-05 — A manager may correct secondary stock while it waits for approval

**Decision (owner):** the manager above an MR (or Admin) can change the MR's figures before approving, instead of only rejecting. The MR still enters the figures; the correction is the exception and is marked.

**Consequences:** new `PATCH /sales/secondary-stock { userId, month, reason, lines[] }` (`EditSecondaryStockUseCase`). Only `PENDING` lines the MR already sent can change (no adding or removing rows); a reason is required; closing may not go below zero; the MR cannot use it on themselves. The line keeps `managerEdit { by, at, reason, original }`, where `original` is the MR's own entry from before the first correction. It is returned on `GET /sales/secondary-stock` (`managerEdit`), logged as `secondarystock.manager_edited`, and cleared when the MR saves again. New refusal `SECONDARY_NOT_PENDING` (409). Approved months still change only through Admin's reopen. Per-MR slices are unchanged, so nothing double counts. The web approval card has a "Correct figures" dialog and marks adjusted lines. The manager report does not yet flag adjusted lines. Phone spec in `docs/mobile/secondary-and-targets.md`; the field app is another team's.

## 2026-11-05 — Sales reports and the dashboard read only approved MR secondary stock

**Decision (owner):** the Sales report, Sales dashboard and employee report counted figures even though no MR had entered secondary stock, because they still read the older distributor-derived path (Admin statements, distributor counts, Done orders). Every sales figure now comes from the **approved MR rows** (`SecondaryStockLine`) alone: **secondary / achievement = issued units, primary = the MR's own primary (received) units, both at PTS**, summed over MRs only. A manager is the sum of the MRs below them and a total counts each MR once, so a distributor's product is MR 2 + MR 4 = 6, never doubled by a manager row. Nothing approved reads **0**, not "nothing entered".

**Consequences:** `DistributorAchievement` is replaced by `MrStockFigures` (one reader over `listSecondaryLines`, approved only) and the pure `primaryOfLines` / `secondaryOfLines` / `toBreakdownRows` / `buildMrMonths` in `reports/domain/mrFigures.ts`. By employee, the dashboard, the employee report, by product, by distributor and the year chart all use them; `primaryOf` / `secondaryOf` and the statement fallback are gone from these reports. This supersedes "months without MR rows behave as before" (2026-11-05, MR secondary stock). The dashboard's achievement is `0` (null only for a manager with no MRs). Admin's primary adjustment and the employee's older per-product secondary no longer feed these reports. Unchanged: the one-month Sales statement and Admin's distributor statement (Admin's own tool), Done orders, invoices, payments, targets, and the mobile-facing `GET /marketing/targets/:userId` summary, whose `achievedPaise` is still the team's order amount.

**Needs a migration:** none. Months before the MR screen existed read 0; say if old counts should be copied into MR rows.

## 2026-11-05 — A manager submits their team's secondary report; the approved snapshot is their personal achievement

**Decision (owner):** a manager's achievement was a live sum of their MRs, so it moved with team changes and promotions and nobody answered for it. The manager now **submits** their (read-only) month of team secondary sales, their own manager (Admin if none) **approves** it, and the approved document is **saved in the database** as that manager's personal achievement. The snapshot records the manager's **designation at that time** (for example RSM) and a **reference to each MR's submitted and approved report** (its approval request id, cycle and decided-at, not the MR as a user), with each MR's totals.

**Consequences:** new `SecondaryRollup` collection (unique on manager + month) and approval kind `SECONDARY_ROLLUP` (record `managerId:month`, manager-only, final approver Admin). `POST /sales/secondary-rollup/submit`, `GET /sales/secondary-rollup`; new refusals `MANAGER_ONLY` (403). The snapshot is built from MR rows directly (any depth), only from MRs whose report is approved; the others are listed, so "6 of 8 approved" is on the record. If an MR report is approved, reopened or approved again afterwards the snapshot is shown **out of date** and the manager sends it again; nothing changes silently. No entry deadline for the manager. Reports: a manager's achievement and primary are their approved snapshot (0 and a `rollupStatus` chip until then), their target stays the sum of their MRs', and company totals, by product, by distributor and the chart keep using MR rows only, so nothing is double counted. A manager's own old approved rows from when they were an MR still count for them. Admin's delete of a month removes the snapshot. The web gets the approval card and the chips (managers sign in on the phone, so the Submit button is a phone contract in `docs/mobile/secondary-and-targets.md`); the field app is another team's.

**Needs a migration:** none; past months have no snapshot, so a manager reads 0 for them (a one-off backfill is possible on request).

## 2026-11-05 — One approval kind and tab for secondary sales; the old per-product and distributor-count approvals are removed

**Decision (owner):** Approvals showed three secondary-related tabs (Distributor stock counts, Team secondary report, Monthly secondary). There is no old data for any of them, so they become **one kind, `SECONDARY_SALES`, and one tab "Secondary sales"**: an MR's month (`mrUserId:month`) and a manager's team report (`managerUserId:month:team`) are two records under it, told apart in the title ("Nov 2026" and "Nov 2026 · team report"). The old per-product secondary approval and the distributor-count approval are deleted.

**Consequences:** removed use cases, routes and the `STOCK_COUNT_APPROVAL` switch are listed in `docs/LLD/sales-and-orders.md`. A distributor count now just saves (as it did with the switch off). One Admin delete of a month removes the rows, a manager's snapshot, the files and both requests. The web drops the employee page's per-product entry grid and Admin's primary-change form (nothing read them any more), the old previews and the old tabs; the approval card for an MR's month keeps Correct figures, files and Delete month. The phone contract in `docs/mobile/secondary-and-targets.md` lists the removed routes (they now return 404). **Supersedes** the 2026-11-04 distributor-count approval and the 2026-10 per-product secondary approval. Not removed: `POST /monthly-stock`, and the `EmployeeSale` collection (no use case reads or writes it).

**Needs a migration:** none; any request still saved under `STOCK_COUNT` or `SECONDARY_ROLLUP` in a dev database would show as an unknown kind and can be deleted.

## 2026-11-05 — System settings are topped up when the server starts

**Decision:** a setting added to the code after the last `pnpm seed` had no database row, and the Admin list shows only stored settings, so seven settings (`MANAGER_CAN_ADD_CHEMISTS`, `DCR_SUBMIT_CUTOFF_DAY`, `LATE_DCR_GRANT_VALID_HOURS` / `_MAX_HOURS`, `LATE_STOCK_GRANT_BY_MANAGER` / `_VALID_HOURS` / `_MAX_HOURS`) were invisible and unchangeable although the code used their defaults. At start the server now adds the default row of every setting that has none (`ConfigContainer.seed`, called from `server.ts`), logging "added N missing settings" with the keys.

**Consequences:** only missing rows are inserted, a stored value (an Admin's edit) is never written, and the Admin account, roles, pay components and leave types stay operator-run (`pnpm seed`), as decided before; this is the one narrow exception, for SystemConfig. `upsertSeed` now returns the keys it added. A test keeps the seed list equal to the defined settings. No migration; an old database gets its missing rows on the next start (or `pnpm seed`, as before, which `manual_deploy.md` still describes).

## 2026-11-16 — A manager sees what their team holds, computed on read; chemists are held by assignment; routes are no longer copied onto managers

**Decision (owner):** a manager's doctor list on the phone did not show their MRs' doctors, and an upper manager (ZSM, NSM) could not see the team's territory. Copying items onto each manager above an MR (doctors, routes) goes stale and needs reference-counting when two MRs hold the same thing. Instead a manager's view is the **union of what the people in their team hold, worked out at read time**; nothing is stored per manager. An MR leaving or moving takes their items with them; an item another MR still holds stays; an item nobody holds shows as unassigned for Admin. The doctor stays one MR per doctor. A manager's territory is the team's main HQs plus what they **own** (their coverage; for a ZSM the whole Zone; for the NSM, with none named, all Zones). Routes load per HQ, paged and searched, never all at once. A **chemist** is now held by assignment, many MRs each, like a distributor (the Route no longer grants it).

**Consequences:** new `ChemistAssignment` (unique active row per chemist and MR), assign/unassign/list for Admin, `GET /chemists/team`, `GET /distributors/team`, `GET /territory/team` and `/territory/team/hqs/:hqId/routes`. The doctors team list no longer hides a doctor whose MR lost the route (it adds `routeNotHeld`); `canView` and visuals follow. The phone's chemist snapshot, call and order checks use the assignment (`CHEMIST_ROUTE_NOT_ASSIGNED` keeps its name). A chemist's adder is assigned on approval, and offboarding ends a leaver's chemist rows. `ExtendManagerTerritoryUseCase` stops assigning routes and the team-gaps report stops listing them. The call check for a team doctor walks up the assigned MR's manager chain instead of loading the whole downline. Not built yet: doctors-list filters by HQ and status, unassigned rows, duplicate-doctor warning and merge, a stored manager chain for very large teams (see `docs/mobile/team-visibility.md` §6). Mobile contract: `docs/mobile/team-visibility.md`.

**Needs a migration:** yes, by hand, with a mongodump first. **Before deploying:** `pnpm --filter @greynote/api backfill:chemist-assignments` (dry run, then `-- --apply --confirm-db=<name>`) so no MR loses a chemist. **After:** `pnpm --filter @greynote/api cleanup:manager-routes` ends the route rows copied onto managers (only where someone below holds the route and the manager has no doctor of their own there; the rest is listed). `reset:field-data` now clears `chemistassignments` too.

## 2026-11-17 — Managers plan route first: Tour Plan routes come from the team, Work With moves to the Daily Plan

**Decision (owner):** routes belong to MRs, so a manager's Tour Plan routes are the routes held by **anyone below them** (plus their own), computed, never copied onto them. The Tour Plan **no longer has Work With**. On the Daily Plan a manager is **route first**: they choose the route(s) among the approved ones, then "Works with" lists only the people below them who hold those routes (and the managers above those holders, with the route in brackets) and the doctor list only the doctors on those routes assigned to someone below them. If nobody or no doctor is on the route, the manager asks their manager or Admin to change the plan (the existing amend of the Tour Plan day or the daily plan). Choosing Works with no longer counts as "changed from monthly".

**Consequences:** `PlanSubmitter.validateDays` now takes the manager's allowed routes from one batch query (`listRoutesForUsers` on the territory contract and the planning route port) instead of the routes held by the manager; it applies to monthly submit and amend as well as daily save, submit and amend. `POST /planning/daily/plan` gains `routeIds` (a manager's subset of the approved routes) and a manager's routes are no longer recomputed from the people named (M3/M4 are superseded; `team-suggest` stays for older phones). A manager's planning doctors are limited to the day's routes (this narrows 2026-11-03 for planning only; logging a call on any downline doctor is unchanged). The monthly writer drops `workWith`, and a Daily Plan is created from a Tour Plan day without it. New `GET /planning/team-routes` and `GET /planning/daily/route-options` (manager only). This makes `cleanup:manager-routes` safe for plans: managers no longer need to hold copied routes. Mobile contract: `docs/mobile/dailyplan.md` §1b, `docs/mobile/monthlyplan.md`, `docs/mobile/team-visibility.md` §2a.

**Needs a migration:** none. Plans approved earlier keep their stored Work With as history and nothing reads it for the rules above. Deploy this release before running `cleanup:manager-routes`.



## 2026-11-17: Dr Call is today's plan only; "not in plan" removed; missed doctors derived

- **Dr Call** offers only the day's planned doctors plus doctors still owed from earlier days; **Follow-up** offers any doctor held (a manager: any downline doctor). The route is the doctor's own and is never chosen.
- **"Not in plan" / "Route not in plan" are gone** from the phone, the web DCR screens and the report tiles; the server stops setting them (fields kept, false). An out-of-date phone's call is still saved, never refused.
- **Owed doctors are derived** into `planning.owedDoctors` at every sync pull (from `CarryOver.pending`) instead of only being written into a plan when it is saved: a plan approved before the miss still shows them. Tomorrow's routes are not rewritten.
- **"Missed Calls" is now "Visit targets"** (monthly frequency, made, remaining) and shows the team as a tree with roll-ups; the daily "missed" is a separate idea.


## 2026-11-18: One list per page (Orders, Gifts, Services, Leave)

- Each page is **one list, newest first, All by default**, with one compact filter row instead of tab sets (Orders: All / Placed / Done / Cancelled; Gifts: All / Not done / Done; Services: All / Waiting / Approved / Done / Rejected; Leave: All / Pending / Approved / Rejected). The Orders "Waiting" tab and the My/Team switch are gone: unsent orders sit in the list tagged "Waiting to send"; a manager's list is their own and the team's, own rows marked "(Own)".
- Gifts lists done gifts too (history). Gifts and Services get a manager's team view on the server (`scope=team`, derived from the downline). Leave stays the employee's own.
- Lists show 20 at a time (infinite scroll over the loaded list), with search, serial numbers and a total.

## 2026-11-18: A re-edited Tour Plan can't rewrite days already worked or sent

- **One locked-day rule** for every way of changing an approved month (employee save, manager edit of a waiting plan, Admin/HR): the day is today or earlier, or its Daily Plan is waiting or approved. `409 PLAN_DAY_LOCKED`. Trips follow from it (the stay and transit days are ordinary entries).
- **Approval restores, it doesn't refuse:** days that became locked between sending and approving are put back to the Daily Plan, else the last approved version (`approvedEntries`), and noted in `amendments`.
- **The Tour Plan mirrors the approved Daily Plan** (working type, routes, remarks), never on trip days.
- A late exception only moves the deadline. Not changed: deadlines, resubmit windows, who approves.


## 2026-11-18: Targets shows only what is approved up the chain, and what is waiting

- Achievement stays **final only when approved all the way up** (MR by their manager, a manager's team report by their own manager, the top by Admin); a live sum would let a manager show a figure their own manager never signed off. The server's final numbers are unchanged.
- The Targets screen now says so: the old "distributors' stock" text and the Done-orders-as-primary block are corrected; a manager sees **what is waiting** (approved MR reports below, live) with the team-report status and the next action; the team is a tree whose lines load when shown.
- `employee-sales` gains `team.approvedMrCount`, `waitingPaise`, `waitingPrimaryPaise`, `reportStatus` (additive). The web Sales dashboard and breakdown are unchanged.


## 2026-11-18: First test round fixes (Demo RSM)

- A manager above the MR can read the doctor service (Approvals review and Services Details were "No such doctor service"); a manager can read a pending or team chemist's record to decide it (address, phone, location, Open in Maps); the other roles' rules are unchanged.
- Services has **My requests / Team requests** tabs for a manager (supersedes the merged list for this page only).
- The Approvals date filter is on the main row with custom From / To dates.


## 2026-11-18: Team tab phase 1: no "Not started"; the board; the person page as tabs

- "Not started" removed: it was a clock rule (no call by 11:00) shown next to an approved plan. The plan chip, route names, doctors visited and the report chip replace it.
- Today's board and the person page's Plans and Reports tabs read two new team endpoints (`/team/day`, `/team/members/:id/days`); `/team/plans` gains doctor names and remarks. Contracts gained `getDoctorNames`, `getDayActivity`, `getActivityRange` and richer `listDailyPlanDays`.


## 2026-11-18: Team tab phase 2: the person's Expenses, Leave and attendance calendar, Doctors and Orders tabs; the doctor page

- Services are the doctor's "how much service": asked services with ₹ and stage (rejected not summed). Field Activity's contract gained `listServicesForDoctors`; Team gained attendance, doctors and doctor reads (downline only).
- The web Doctors list column for services is not built yet.

## 2026-11-18: Team home is the board; drafts are not a status; Tour Plan visible; holdings of a manager's team

- One Team screen (the board with the list's actions). "Plan not sent" removed: a draft Daily Plan is the Tour Plan's day, shown as "Tour Plan: route"; "Daily plan not submitted" only after the submit time. Wording: Tour Plan (month) / Daily plan (day).
- The person's Plans tab shows the Tour Plan and its download; Doctors, Chemists and Distributors are separate tabs and, for a manager, cover the people below them.


## 2026-11-18: Team board controls, gifts on doctors, secondary on the person page

- Board: one day picker, two dropdown filters and one expand/collapse toggle; tiles show done/total (`plansSubmitted`). Plans tab drops the "not sent" list.
- Gifts are read per doctor for managers (Field Activity `listGiftsForDoctors`); secondary sales on the person page reuse the existing stock read instead of a new team route.
- Managers land on Team requests in Services.


## 2026-11-18: Team → Reports cut to six rows

- Today board, Plans and Daily reports removed from Team → Reports because the Team board and the person page cover them. The rest stays; the rarely used four sit behind "More". Server routes unchanged.


## 2026-11-18: Team → Reports reduced to Expenses, Secondary sales, Leave requests; one Download on the person page

- Team overview, Sales & compliance and Team orders removed (repeat the board and the person page). New team Expenses read; `secondaryUnits` added to team stock rows; Field Activity's contract gained `listExpenseMonthSummaries`.
- Person page: day picker for the header, Plans tab as day blocks, one Download (Tour Plan, Daily plans, Expenses).


## 2026-11-18: Secondary Sales sheet (Excel), one employee at a time

- One sheet in the company's format per employee and financial year (an MR's own figures, a manager's sum of their MRs), products down the side, targets (units) and approved secondary by month, quarters, halves, the year, N.S.R. = PTS, grand total in ₹ lakh, % GR. against the year before. `GET /reports/secondary-sheet?userId=[&year=]`, built with `exceljs`; `year` defaults to the current financial year (the first version failed with a validation error when the apps sent none).
- Downloaded from the employee page on the web and from a person's page / secondary stock on the phone. No whole-company or team workbook, and no CSV for this report (an earlier version had both).
- Local demo data: `seed:secondary-demo` (rows written directly as approved; no Cloudinary locally).


## 2026-11-18: Monthly Work report (Excel) per employee per month; doctors this month in the app; downloads save to the phone

- One report instead of two (Daily Work + Expense): a row for every day of the month with kind of day (weekly off, holiday, paid / unpaid leave, worked, absent), plans, DCR, doctors, calls, orders and TA / DA / other, plus Overview and Doctors sheets. With the Secondary Sales sheet these are the reports. Month only; a financial-year version is later.
- Carried, not called and missed are defined once (docs/mobile/team.md) and shown in the app (person Overview card, Doctors filter, Visit targets) and in the report.
- Planning's contract gained `listMonthlyPlanDays`; Field Activity's `getExpenseStatement`; HR's `listLeaveDays` is read by Reports; Team's doctors read `carriedSince` and `totals`.
- Phone downloads save to a remembered folder (picked the first time) instead of opening the share sheet; Open and Share are offered after saving.
- Local demo data: `seed:work-demo` (written directly as approved).


## 2026-11-18: The day in doctors (carried in, missed, carried on) for the manager's daily report view

- The carry-over loop is one shared pure function used by the Monthly Work report and the new team day read, so the two always agree. A manager sees it on the daily report (Approvals) and in each day of a person's Reports tab; today's carry-on is "so far".


## 2026-11-18: Team polish: Doctors this month page, Monthly work report row, Unblock only blocked people, Distributors, Territory routes in place

- Phone-only changes; the numbers come from the doctors read already added. The team CSV of the expense list is gone (the report is one Excel per person).


## 2026-11-18: Forgot password with an emailed code, for everyone

- The Admin-only reset became general: the code goes to the email in the employee's own details; no email = "contact your Admin" with an Admin's contact; per-person limits (once a minute, five a day) replace the system-wide daily cap. Phone: Login and Change password link to the new screen; the web page uses the same endpoints.


## 2026-11-18: An employee's email can be added and changed on the web

- Reset codes go to the email in the employee's details, but it could only be set at creation. Now Admin/HR edit it on the employee page (unique, logged), with a No email filter on the list.


## 2026-11-19: A manager's change to an approved Tour Plan is a change request; a Daily Plan's routes are the Tour Plan's

- **Context.** Only Admin/HR could change a Tour Plan after approval, and a manager could narrow a Daily Plan to fewer routes than the Tour Plan, so the two could differ.
- **Decision.** (1) A manager above the employee, at any level, can edit the **approved** month from the phone (days after today only; never a day whose Daily Plan is sent or approved). It does not apply at once: it is kept on the plan as `pendingChange` and put in front of the **editor's own manager, else Admin** as a `MONTHLY_PLAN_CHANGE` approval (`recordId` = `<plan id>:<change id>`, so a rejected change can be sent again by anyone). Admin/HR edits stay immediate. Approving applies it: the past-day and sent-day rules and the plan's revision are **checked again at that moment**, nothing is written if one fails (the approver is told to reject it and ask for a new one), the untouched Daily Plans follow, the old days stay in `amendments`, and the employee is told. One change waits at a time; no new collection (Atlas collection limit). A trip that runs into next month can't be changed this way (Admin does it). (2) A Daily Plan's routes always equal its Tour Plan day (field days; a meeting or strike has none): the manager's route narrowing is gone, a Daily Plan amend can't change routes, and **submit and approve of a day whose routes differ are refused** (`PLAN_ROUTE_MISMATCH`: change the Tour Plan first). TA/DA already comes only after the report is approved, from the Daily Plan's routes.
- **Consequences.** A route change for one day is a Tour Plan change through approval. Before deploy, check future Daily Plans whose routes still differ (narrowed earlier): they would be stuck until the Tour Plan day is changed to match.


## 2026-11-19: A trip may run over weekly offs and holidays and come back on one; the start of a trip can be moved

- **Context.** A trip could not cross a weekly off or holiday (so none could return after the next Sunday, or from the 27th to the 8th of next month) and the phone had only a ‹ › stepper; the start day could not be changed.
- **Decision.** The server writes no stay or return entry on an off day (`expandTrips`/`carriedInto` take the off days); the trip's `returnDate` still says where it ends. Those days stay Weekly off / Holiday: no Daily Plan, report or DA, and a return on one earns no TA. The first day of a trip still cannot be an off day. The phone uses the month calendar for the return date and a "Leaves on" calendar to move the start (the trip moves with it); the same applies to a manager's or Admin's edit of an approved month (days after today, locks unchanged).


## 2026-11-19: Only the doctor's MR (and Admin) adds visuals; a manager takes them off

- **Decision.** Adding visuals to a doctor is the doctor's own MR's job (and Admin's, on the web); a manager, including one who holds the doctor themselves, cannot add (`403 ONLY_MR_ADDS`). A manager above the doctor's MR, and Admin, take visuals off; the MR cannot. The list answers with `canAdd` and `canRemove`. On the phone a manager sees the doctor's chosen visuals with Remove and no tick boxes or Submit.


## 2026-11-19: Doctor service types, totals, per-doctor rows and a download

- **Types.** A new request is Honorarium, CME, Training, Online promotion or Others. Tour package and Gift stay on the rows that have them (read and approved as before, labelled) and an older phone's queued request of either still syncs; nothing is migrated.
- **Totals.** "Gone to the doctor" is what is **approved**; what still waits is shown apart; rejected, withdrawn and unsent count for nothing; "carried out" is the approved part marked done. The phone and the web Services page show Approved / Waiting (and Carried out on the web) for the list on screen, with a **By doctor** view (one row per doctor).
- **Download.** `GET /field-activity/doctor-services/report` (and `/summary` for the figures) gives an Excel workbook: **By doctor** (a column per type, approved total, waiting, carried out, a grand-total row) and **Requests** (every request, with its total). Scope follows the list: an MR's own, a manager's team (`?scope=team`), Admin and Accounts everyone; optional `from`/`to` (business dates), `doctorId`.


## 2026-11-19: Secondary sales reports show amounts (units × PTS)

- **Decision.** The web Secondary report and the Secondary Sales performance Excel show rupees instead of units; entry stays in units and the phone screens keep units. A product with no PTS cannot be priced: "—" on the web (and left out of the totals, which say how many), 0 in the Excel. The Excel's % GR. compares this year's amount with the year before at the same N.S.R.


## 2026-11-19: An MR Distributors screen; both lists are searchable

- **Decision.** Home → Marketing gets **Distributors** for everyone: the distributors handed to the signed-in person, from the last pull (works offline), with name, place, contact person, mobile (tap to call), GST and the routes they serve, and a search over all of those. A manager sees the same for their own and a "Team distributors" button to the server-searched team list (Team → Reports → Distributors, which already searched by name, GST and contact). No server change: the snapshot already carried the contact fields.


## 2026-11-19: Reopen replaces the manager change request for an approved Tour Plan

- **Decision.** Supersedes "A manager's change to an approved Tour Plan is a change request" of the same day (that code is removed). A manager above the employee, or Admin/HR, **reopens** an approved Tour Plan with a reason (`POST /approvals/:id/reopen`, now open to a field manager for a `managerReopen` kind, only for someone below them); the employee changes days after today under the existing locks and **sends it again even in the running month** (a `REOPENED` plan skips the submit deadline); the employee's manager or Admin approves again. While it is reopened or waiting again a month that was approved before stays open for calls and Daily Plans (`isMonthlyPlanApproved`, and `wasApproved` in the sync snapshot so the phone agrees); a rejection or withdrawal closes it. The employee gets a push on reopen (`approval.reopened`).
- The route rule (a Daily Plan's routes equal its Tour Plan's) stands.


## 2026-11-19: Late exceptions last 30 minutes, 1 hour or 12 hours; a past financial year is view-only on the phone

- **Late exceptions.** Plan, expense and unified grants take `duration`: `30m`, `1h` (default) or `12h`, from the moment it is granted (a daily plan's is still cut at the end of its day). The free end time is gone from the API, the phone screen (30 minutes / 1 hour / 12 hours) and the web dialog (a Length select). An older client's `expiresAt` is ignored (it gets 1 hour). `LATE_*_GRANT_VALID_HOURS` and `*_MAX_HOURS` no longer set the length.
- **Past financial year.** Picking a past year makes the phone view-only: any non-GET call is refused client-side with one message (sign-in/out, refresh and the background sync/backup stay open), uploads too, and saving, editing or removing a call, follow-up, expense, doctor, chemist, service, gift or order is refused at the outbox. The entry-only Home tiles (Daily Plan, Tour Plan, Dr/Chemist Call and Follow-up, Summary & Submit) are locked with the same message; mixed screens stay open to read history. The web was already read-only.

## 2026-11-19: HR approves every kind like Admin; only Admin reopens or deletes

- **HR approves anything.** HR is now a final approver and an override role (may decide at any stage, ahead of the manager) on every approval kind: DCR, Doctor Service, Expense month, Secondary sales, new Doctor and new Chemist, besides the Plans and Leave it already had. HR sees them in its queue, All and detail. The web says "HR or Admin" and warns HR, as it does Admin, when approving skips the manager.
- **Not for HR.** Reopening an approved request is Admin only (plus a field manager for the Tour Plan, `managerReopen`); HR is no longer an `overrideRoles` shortcut to it, so HR cannot reopen the Plans it could before. Delete month stays Admin only. `POST /approvals/:id/reopen` no longer lists HR.

## 2026-11-19: An order keeps every office change; the phone shows who changed what, and the final bill

- Until now an order kept only the employee's original lines and the *last* editor. `Order.editHistory` now keeps one entry per change (who, their name then, when, the lines and total it left) while the order is Placed; older orders simply have none. Optional on the wire, so phones already in the field keep working. The change is written in the same update as the edit.
- The phone's order detail has a "What the office changed" card (each change line by line, with the total before and after) and, for a Done distributor order, a "Final billing" card: what you ordered, after the office's changes, delivered, GST and the invoice total with its number. Contract: `docs/mobile/orders-and-stock.md` row 10.
- Also on the web the same day: Visuals has a doctor search (server-side) to manage one doctor's visuals; a Monthly work report page (employee and month, Excel); the invoice text is a step bigger. Doctor Services already showed the investment total and a per-doctor view.

## 2026-11-19: A reopen carries a deadline; withdraw gets a resubmit window; days that are over stay locked

- **Reopen asks for a time.** Reopening a Daily or Tour Plan takes `duration` (30m, 1h, 12h; 1h when omitted, so phones already in the field keep working). It becomes an ordinary late-submission exception for that plan (a Daily Plan's cut to the end of its business day) and is used up by the resubmit. This replaces "a reopened Tour Plan skips the deadline". Only Admin reopens a Daily Plan; a field manager reopens only a Tour Plan of someone below them. HR reopens neither.
- **Today's sent plan can change.** The employee withdraws it (it cannot be approved meanwhile), edits and submits again. A withdraw now opens the same short resubmit window as a rejection, capped at 11:30 for a Daily Plan, so it no longer ends in `PLAN_SUBMIT_LATE`.
- **Days that are over are locked for every Tour Plan**, approved or not. A never-approved plan can still plan today and later. The phone opens the day a running trip began on so its return date can move.

## 2026-11-19 (later): today is open until its Daily Plan is approved

- **Today's lock.** Today locks only when its own Daily Plan is **approved**; while it is draft, waiting, withdrawn or reopened, today can change, so a trip that began today can change route. Days before today stay locked, and a later day locks as soon as its Daily Plan is sent.
- **Old daily plan vs new Tour Plan.** If the Tour Plan's routes change after today's Daily Plan was sent, approving that Daily Plan is refused (`PLAN_ROUTE_MISMATCH`) with a message saying to reject it or have the employee withdraw it and send it again. The phone shows the same warning on that Daily Plan with a Withdraw button. When the re-sent Tour Plan is approved and today's Daily Plan got approved meanwhile, approval keeps today as it was (as it already does for locked days).

## 2026-11-19 (later): one Tour Plan Excel from the server, on the phone and the web

- **Why.** The phone's Tour Plan CSV showed `####` in the date column when opened in Excel (a CSV can't set column widths), and the web's CSV had different columns from the phone's.
- **What.** The server builds one workbook, `GET /api/reports/tour-plan`, in the phone's layout (Date, Day, Work type, Trip, Routes, From, To, Work with, Remarks, a row for every day); the date is a real date in a wide column. The phone and the web only download it, so they match. Only an approved plan can be downloaded, on both. The employee can also download their own from Reports → TP Report; a manager from Team; Admin from the web (Employees, and the approval page). The phone's and the web's own CSV builders for the Tour Plan are removed.

## 2026-11-19 (later): a past financial year locks Team too, and Team's "today" is the year's last day

- Team showed the real today (and failed with `OUTSIDE_FINANCIAL_YEAR` on the approvals presets) and left Unblock, Reopen Tour Plan and Late exceptions looking usable in a past year. They are now switched off with the banner, and Team's day, date pickers and presets use the year's last day (`useFinancialYear().effectiveToday`). Team downloads start on the year's last month.
- Reports has the financial-year chips at the top, so a past year and its last month are one tap away. The server is unchanged.

## 2026-11-19: reset codes go only to the person's own email

`PASSWORD_RESET_OWNER_EMAIL` is gone. An Admin with no email on their record is answered `NO_EMAIL` (with another Admin to contact) like everyone else; nothing is sent to an address from the environment. The `SMTP_*` settings stay: they only say which mailbox sends. Before deploying, give every Admin an email, or they lose self-service reset.

## 2026-11-19: Excel and settings tidy-ups

- Monthly Work Report, Daily tab: the "Visited (names)" and "Missed (names)" columns are gone (the counts stay; the Doctors tab stays).
- Tour Plan Excel: a **Manager** column (the employee's direct manager, on every row) and a **Route type** column; the Routes column is gone. From, To and Route type hold one line per route, in plan order, so line 1 of each belongs together.
- System settings (web): each module is a collapsible section with its own fixed deep colour (Payroll red); open or shut is remembered in the browser.

## 2026-11-19 (later): the web follows "a manager holds what their team holds"

- **Lists.** On the web, the Doctors, Chemists and Distributors lists treat the "Anyone assigned" employee filter, and the search box (which already matched an MR's name or code for doctors, and now does for chemists and distributors too), as the person **and everyone below them at any depth**, the rule the phone's Team already used. `directOnly=true` (the "Only direct" button) keeps the old strict view. Nothing is copied onto the manager; it is worked out per request (`assigneeScope` in field-master-data).
- **Who holds it.** The chemist and distributor admin lists now return `assignedTo` (the holders' names), and each list has a "Held by" column, so a manager's view shows the downline employee a record really belongs to.
- **Employee page.** The Assigned card shows the first 5 doctors, chemists and distributors the employee and their team hold, each with who holds it, then "+N more · View all" linking to the list filtered to that employee. Remove on a row takes it off the holder, after a confirmation that names the holder and says it leaves the manager's list too; a chemist or distributor with several holders links to its own page to choose.
- **Routes** on the employee page are unchanged (own routes, with the existing "routes the team holds" offer).

## 2026-11-19 (later): assign doctors, chemists and distributors from the employee page, several at once

- **Assign button** on each block of the employee page's Assigned card (Admin, an active field employee, not while a past year is on view). It opens one modal: **search** by name, tick several (across pages), **review** the names about to be assigned with what each does to who holds it now (a doctor "moves from X"; a chemist or distributor "adds to X, who keep it"), then a result listing what went through and what was skipped with the reason.
- **List filter `eligibleFor=<userId>`** on the Doctors, Chemists and Distributors lists: active doctors and chemists on the routes the employee holds, distributors that cover where they work. For doctors it is the only list offered, because a doctor can only go to an employee who holds its route. For chemists and distributors "Only on their routes" can be switched off.
- **Bulk assign**: `POST /api/field-master-data/assignments/{doctors|chemists|distributors}` with `{ userId, ids[] }` (up to 200), one result per id (`ASSIGNED`, `MOVED` with `from`, `ALREADY`, `SKIPPED` with the reason). Each id goes through the single-record rules (route held, one doctor holder replaced, the replaced MR loses it from editable plans); one failure never stops the rest. Admin; the Accountant too for distributors, as they edit those.

## 2026-11-19 (later): the assign modal also takes things off (tick = held, untick = remove)

- The picker now lists what the employee holds too, **ticked**. Unticking a held one takes it off that employee; ticking others assigns them. The review step lists "will be assigned" and "will be taken off" separately (a doctor taken off is left with nobody until assigned again; a chemist or distributor stays with its other holders). The earlier idea of hiding what is already held is dropped.
- `POST /api/field-master-data/assignments/{doctors|chemists|distributors}` takes `removeIds[]` next to `ids[]` (at least one of the two); results gain `REMOVED`. Removal runs the single-record unassign (a doctor released from the MR's editable plans); one failure never stops the rest.

## 2026-11-19 (later): System settings in a light tint, sections open by default

- The deep solid section headers (white text on `-700` colours) are replaced by a pale header with a coloured left edge, and the setting rows under it carry a faint tint of the same colour, so the section reads as one block. Every module has its own light colour (Salary and payouts, which holds the expense deadlines, is red). The "invalid" chip stays solid red.
- Sections now start open; a fold the person chose is still remembered. Web only; no setting or rule changed.

## Secondary sheet counts rupee targets (2026-11-20)

The Secondary sales sheet dropped targets set in rupees (all products, or a product with no quantity), so an employee whose target was set that way (e.g. a ₹38,10,000 target) showed 0 target and the Sales report disagreed with the file. They now have one row of their own in the file ("TARGET SET IN ₹ (not by product)") and are counted in the grand total and % ACH. `GET /reports/secondary-sheet` is unchanged apart from that row.

## Targets are set per product, by a percentage split (2026-11-20)

The client chose product-only targets. A rupee total is only a way to enter them: the web's *Set target* takes the months and a total and shares it across the products by percentage (the percentages must come to exactly 100, to two decimals; products at 0 get none), or takes an amount per product. Each product with a share becomes one target (`POST /marketing/targets/bulk`, all or nothing). Amounts are split in whole paise by largest remainder so they add up to the total exactly. Targets over different or overlapping months all count and add up per month (each spread evenly over its months), as before. A target without a product is no longer accepted; old ones keep counting and are split by hand with *Split by product* (or removed), so the Sales report, dashboard and Excel agree again. Only an MR holds targets: a manager's page shows their MRs' total, read-only. The targets table (month by month, and as they were set) is on the sales dashboard's employee page and on the employee page's new Targets tab (Admin and HR). Supersedes the 2026-10-10 note that all-products targets are counted beside product ones, and the stale line that a manager sets targets.

Existing all-products targets are turned into product targets by `pnpm --filter @greynote/api migrate:split-targets` (dry run by default, `-- --apply` writes): each one of the current financial year is divided **equally** across the active products that have a PTS, in whole paise that add up to it (the extra paise go to the first products by id), then removed. A person who already has a target for a product over exactly those months gets the share added to it. Past years, campaign targets and anyone who is not an active MR are left alone. Run once, after the API that refuses all-products targets is deployed.

## Route form shows what the route pays, per pay grade (2026-11-22)

New route and a route's Details now carry a live **What this route pays** card: the formula `TA = min(distance, TA_MAX_KM) × rate per km` with the typed numbers, a note when the distance is over the cap, "an HQ route earns no TA", whether the route's own rate or each grade's rate is used, and a table of every pay grade with its TA for this route, the DA for the route's type, and the day total. It updates as the form is filled in. Web only: it reads `TA_MAX_KM` from the settings and the grades from Pay grades, and uses the same arithmetic as the server (km never doubled, half a paisa rounds up, once). The rule itself is unchanged: if the MR is paid for the way back, the full there-and-back km is entered.

## Secondary sheet shows units; the grand total stays in rupees (2026-11-22)

The Secondary Sales performance sheet (Excel, shown on the web's Secondary sales page and downloaded from the phone) went back to **units** for TGT and SEC, because secondary is entered in units and a rupee figure could not be matched to what the MR sent. Every product row, month, quarter, half and the year is in units; the headers say `(units)`; % ACH and % GR. are unchanged in value. The **GRAND TOTAL** row is still in rupees lakh, now worked as `SUMPRODUCT(units, N.S.R.) / 1,00,000` per block, since units of different products cannot be added; a product with no N.S.R. shows its units but adds nothing to the total. The row of old rupee targets (not by product) stays as the last row, in rupees with N.S.R. 1, and goes once `migrate:split-targets` has been run. This replaces the TGT/SEC part of 2026-11-19 for this sheet only; the Sales report, dashboard and the web's other Secondary reports stay in rupees. Server only: the file is built by the API, so neither the web nor the phone app changes.

## 2026-11-26: Places; routes run Place ↔ Place (phase 1 of the one-HQ / From → To redesign)

**Context.** The owner found HQs, routes and the Tour Plan too complex. A route's type was fixed ("HQ to destination"), which is wrong for a manager working in a team member's HQ, and doctors hung on a route, so "p1 → p2" did not show the doctors of "p2". Agreed with the client: every employee has one HQ; routes are no longer handed to people; a Tour Plan day is one From → To, and only along a route Admin has typed (no computed km); a day trip pays the km twice (cap first), going away / moving / returning pay one way, DA is worked out against the employee's own HQ; doctors, chemists and distributors sit on a place. Built in six phases; this is phase 1.

**Decision (phase 1).**
- **Place** (`places`): a town or station under one HQ, with a type (HQ / Ex / Out) for that HQ's own people. Every HQ has one **HQ town** place (`isHqTown`), named after the HQ, made with it, renamed and (de)activated with it, and not editable on its own. Names unique per HQ, ignoring case. A place with an active route can't be deactivated; an HQ can't be deactivated while it has active places or routes.
- **Route** gains `fromPlaceId`, `toPlaceId` (one route per pair, whichever way round: `pairKey`, unique) and `taFixedPaise`. Its HQ is the From place's, its name "From to To" (a To place in another HQ gets the HQ in brackets, unless it is an HQ town), its type the farther end's, or Out-station across HQs. Name and type follow the places: a place rename or re-type re-makes its routes; they can't be edited on the route. A route needs two different places.
- **TA on a route** is one of: each grade's rate (default), its own rate per km (`taPerKmRateOverridePaise`, as before), or a **fixed amount** for the day (`taFixedPaise`: paid as typed, never doubled or capped). Setting one clears the other. Until phase 5 the current TA rule applies, with the fixed amount used when that route is the day's longest.
- The older create form (`hqId` + `destinationName`) is still accepted: it becomes HQ town ↔ a place of that name. Routes not yet migrated keep the old km-driven type rules.
- **CSV import of routes** (`POST /api/territory/import/routes`): from_hq, from_place, to_hq, to_place, km, optional from_type / to_type (to create a missing place), ta_rate, ta_fixed (₹). All-or-nothing; same km = skipped; different km = a problem.
- Permanent delete of an HQ or Zone also removes its places and any route of another HQ that ends at them.
- Web: **Places** page (Territory), route form with From / To pickers and the TA choice, routes list with From / To / TA columns, a place filter and "Upload CSV".

**Needs a migration: yes.** `pnpm --filter @greynote/api migrate:places` (dry run), then `-- --apply` (mongodump first in production). It makes the HQ towns and one place per (HQ, destination), and links every route as HQ town ↔ place, keeping ids, names, km and rates. A route "X to X" (work inside the HQ town) becomes town ↔ town and is kept for old plans and doctors. Safe to repeat. Run before using the new screens.

**Not yet (later phases):** one HQ per employee and routes by HQ instead of assignments (2), doctors / chemists / distributors on places (3), Tour Plan From → To (4), the new TA/DA rule (5), the phone (6).

## 2026-11-26: One HQ for every designation; routes come from the HQ (phase 2)

**Decision.**
- **Every field employee, MR to NSM, is based in exactly one HQ** (their main HQ, `UserHqAssignment`). It is what TA/DA is measured against: a manager working in a team member's HQ is out-station there, whatever they can plan.
- **Routes are no longer handed to people.** The routes someone can plan are the active routes whose both ends are places of their HQ (`listRoutesForUser`). For a manager's plan, Planning already asks for the manager plus everyone below them (`listRoutesForUsers`), which now means the routes within their own HQ and their team's HQs, including a route from their HQ into a team HQ. "Who holds a route" (`listHoldersOfRoutes`, used for Works with) is everyone based in the HQ of either end. A route not yet migrated to places counts for its HQ.
- **Coverage is reduced to the one HQ.** `GET /users/:id/coverage` answers the main HQ and its Zone; `PUT` takes exactly one HQ (zones alone or several HQs are refused), makes it the main HQ and replaces the stored coverage with it. Holidays follow the main HQ only (`getUserTerritory`). Extending a manager's territory and team gaps answer "nothing to add" (kept for older clients).
- **Manager candidates** hide nobody for where they are based; within a level, those based in the employee's HQ or its Zone come first (`covers`), the rest `none`.
- **New employee:** the Work step asks for one HQ for every designation and no routes; finalizing assigns that HQ only.
- Web: the employee page's Territory card is an **HQ** card (one picker, "Not set" warned); the Routes card lists the routes of their HQ, read-only; a route's page says who can plan it instead of listing assigned MRs; the manager picker no longer offers to extend territory; "Territory gaps" is gone from Employees.

**Needs a migration:** no. Route assignments and old coverage stay stored as history and are not read. **Check before deploying:** field employees with no HQ get no routes until Admin sets one (locally: 5 of 46, two NSMs, an RSM and two MRs). Old phones keep working: they receive the same route lists, just larger.

## 2026-11-26: Doctors, chemists and distributors sit on places (phase 3)

**Decision.**
- **Doctor and Chemist get `placeId`**, the place they sit at. Their `routeId` stays, as the route they are reached by, for the readers that still go by routes until the Tour Plan reads places (phase 4: plan doctors, calls, team views). For a record placed by place it is the place's **anchor route**: the active route between the place and its HQ town (for the HQ town itself, town ↔ town), else any active route touching it. A place with no active route can't take a record yet ("Add a route to it under Territory → Routes first").
- **Writes take a place, or a route from an older client** (the phone): a route means its To place (`resolvePlace`). Admin create/edit, MR-added doctors and chemists (`POST /doctors/added`, `/chemists/added`, the sync push) all accept `placeId` or `routeId`.
- **Who may hold or add one follows the HQ**, not routes: an MR sees their assigned doctors on places of the HQ they are based in (`DOCTOR_VISIBILITY_FOLLOWS_ROUTE`, name kept); a doctor can be assigned, approved onto, or handed over to someone based in its place's HQ; an employee adds a doctor or chemist only on a place of their HQ (the phone's refusal still names `routeId`, so its message is unchanged). The manager's team list flags a doctor whose MR's HQ lacks its place (`routeNotHeld`, name kept).
- **Distributor gets `placeIds`** beside Zones and HQs (its `routeIds` stay as stored). Coverage, "serves where the employee works" (now the employee's HQ, its Zone, places and routes) and the list filters read places; the phone's snapshot still gets concrete `routeIds` (places add their anchor routes).
- Lists filter by `placeId` (doctors, chemists, distributors, assigned doctors); the sync snapshot carries `placeId` / `placeIds` (optional, so old phones are unaffected).
- Web: doctor and chemist forms pick a **Place**; the Doctors and Chemists lists show and filter by place; assigning a doctor searches field employees (the server refuses anyone not based in the place's HQ); the distributor coverage picker is Zone → HQ → **places**.

**Needs a migration: yes.** After `migrate:places`: `pnpm --filter @greynote/api migrate:outlet-places` (dry run), then `-- --apply`. Each doctor and chemist takes its route's To place; each distributor's routes become places. Records whose route has no place (deleted, or not migrated) are listed to fix by hand. Safe to repeat. Locally: 1370 doctors, 71 chemists, nothing unplaced.

## 2026-11-26: A Tour Plan day is one From → To (phase 4)

**Decision.**
- A field day (field work, doctor campaign) stores **`fromPlaceId` and `toPlaceId`** (Monthly Plan entry, Daily Plan, `PlanDay`). The server finds the **typed route between them** (`PlanPlaces.normalize`, whichever way it was typed) and keeps it as the day's `routeIds`, so TA/DA and reports keep reading routes until phase 5. **From = To** is a day spent at one place: no route. Two places with no typed route are refused ("Ask Admin to add one").
- **Older phones** keep sending `routeIds`: a single route means its two places (as typed: an HQ-town route reads as HQ town → place); several routes stay a route-only day as before. Days from before keep their routes and trips.
- **Who may plan where:** both places must be in the owner's HQ, or for a manager also in the HQ of anyone below them (`PlanSubmitter.validateDays`, against `listPlacesForUsers`). The route check is unchanged.
- **Doctors of the day are the ones at its To place** (`CarryOver.compose`; route-only days still use their routes). A manager's "Works with" on a day at one place counts whoever holds the route that reaches it.
- **Trips** (`returnDate`, stay and return days) are not offered on a From → To day: the days themselves say where the person is. Older days keep theirs.
- New reads for the pickers: `GET /planning/places?userId=` (the places the plan can go to, with HQ names) and `GET /planning/destinations?fromPlaceId=&userId=` (staying at From, plus every place a typed route reaches, with its km). The owner, managers above them, Admin and HR.
- The Tour Plan Excel shows From and To as place names and the To place's type; the phone's sync snapshot carries the places (optional fields).
- Web: Admin/HR/manager editing a Tour Plan (approvals) pick **From** and **To**; the next day's From starts at the previous day's To; route-only days still show their routes until changed.

**Needs a migration:** no. **Deploy with phase 5:** a From = To day has no route, and only the phase 5 TA/DA reads places, so ship them together. Managers' route-based team pickers (`/team-routes`, `/daily/route-options`) stay for the phone until phase 6.

## 2026-11-26: TA/DA of a From → To day, against the employee's own HQ (phase 5)

**Decision.** A day planned From → To is paid by `calculatePlaceTaDa` (Field Activity), measured against the HQ the employee is based in. A place is **away** when it is outside that HQ, or an out-station place of it:

| Day | TA | DA |
|---|---|---|
| **Day trip**: neither place away (home the same night) | the route's km **× 2**; none when To is an HQ place | To's type (HQ / Ex) |
| **Going or moving away**: To away | the route's km, one way | Out-station |
| **Staying**: From = To, away | none | Out-station |
| **Return**: From away, To not | the route's km, one way | Ex-station |

- km: `min(km, TA_MAX_KM)` first, then × 2 on a day trip, rounded half up to whole paise **once** (so 10.67 km at ₹7.50 is ₹80.03 one way and ₹160.05 there and back). Rate: the route's own per-km rate, else the grade's.
- A route with a **fixed TA** pays it as typed: never doubled or capped.
- A day at one home-side place (From = To, not away) is a day trip on the route that reaches it (its anchor route).
- A route with no km is a ₹0 TA row flagged `distanceFlag`. A doctor campaign earns DA only; a strike nothing; meetings and conferences have no places and keep HQ DA.
- A manager working in a team member's HQ is always out-station there; the day back to their own HQ is the return day.
- **Older days** (route lists, trips) keep the route rule (`calculateTaDa`), as does any day whose places or the employee's HQ can't be found.
- Generated, as before, once when the daily report passes the manager; only from then on (days already approved keep their rows).
- Web: the route form's "What this route pays" shows TA one way and for a day trip, and the new notes.

**Needs a migration:** no. Ships with phase 4.

## 2026-11-26: The phone plans From → To (phase 6)

**Decision.**
- The Tour Plan day form (own month, and a manager editing someone's) picks **From** and **To** instead of ticking routes (`FromToField`). An MR's lists come offline from the `territory` pull, which now carries `places` (the HQ's places, HQ town first) and each route's `fromPlaceId` / `toPlaceId`; a manager's (team HQs too) and someone else's come from `GET /planning/places` and `/planning/destinations`. To offers only places a typed route reaches, with its km, and "Stay at From". Trips are not offered on such a day; older days show their routes until From and To are chosen.
- A new day's From starts at the HQ town at the start of the month and after a day trip, otherwise where the last day ended.
- The Daily Plan offers the doctors at the day's To place; the day is shown as "From → To" / "At <place>" on the month, the day card and Today.
- No app-version gate exists, and none is needed: older phones keep working (a single route they send becomes its two places; doctors keep their `routeId`).
- Contract: `docs/mobile/monthlyplan.md` §10, `dailyplan.md` ("From → To days"), `team-visibility.md` ("One HQ, places").

**Needs a migration:** no. Ships after phases 1–5 (server first).

## 2026-11-27: One Territory page

**Context.** Zones, HQs, Places and Routes were four pages: setting up one HQ meant visiting all four, and nothing showed which places still had no route.

**Decision.**
- One sidebar item, **Territory** (`/territory`). *By HQ*: Zones and their HQs on the left (search, add zone, add HQ in a zone, rename / deactivate / delete); the chosen HQ on the right with its **places** (HQ town first; each with the km and TA of its route from the HQ town, or "⚠ No route [Add km]") and its **other routes** (place ↔ place inside the HQ, and to or from other HQs). *All routes*: the company-wide list (search, filters, CSV upload). With no HQ chosen, the page lists the HQs whose places still lack a route.
- **A place is always added with its km from the HQ town** (required, with the TA choice), and that route is made in the same save (`POST /territory/places` with `distanceKm`, `taPerKmRateOverridePaise` / `taFixedPaise`). Everything is checked first; if the route is still refused, the place is removed again and the error returned — no place exists without the route it is planned by.
- **One way to make any other route: "+ Route"** (`AddRouteDialog`, with the pay preview) — in an HQ (From = its places) and on All routes (From = any place). The separate New route page is gone (`/routes/new` redirects to All routes); "Add a route from here" is gone. A place left without its HQ-town route (older data) shows "No route" and opens the same dialog, both ends chosen. Rename / re-type a place is edit-only (`PlaceFormDialog`).
- The Zones list: a search over zone and HQ names on top (a matching zone shows all its HQs), Expand all / Collapse all, zones closed except the chosen HQ's, and no scroll of its own. The sidebar shows one "Territory" item with no section heading.
- Searchable dropdowns inside dialogs are drawn on the dialog itself, so the dialog's scrolling body no longer hides them (e.g. the Zone in "New HQ").
- `GET /territory/routes?touchingHqId=`: routes with either end at a place of the HQ. `GET /territory/places?missingHqTownRoute=true`: active places with no active route to their HQ town.
- `/zones`, `/hqs` and `/places` redirect to `/territory`; `/routes` to the All routes tab with its filters; `/routes/new` and `/routes/:id` stay.

**Needs a migration:** no.

## 2026-11-27: Territory page — pay charts, text actions, one route dialog

**Decision.**
- **One compact dialog for a place and its route** (`PlaceRouteDialog`, the "New route" layout: normal width, fields stacked) replaces the route page and the place edit dialog. **View** opens it read-only with an **Edit** button; the row's **Edit** opens it in edit mode. For a place's own route from its HQ town, the place's name and type are edited there with the km and TA; other routes show their type read-only (it comes from their places). Deactivate / Delete sit under the chart. `/routes/<id>` redirects to `/territory?tab=routes&route=<id>` (`&edit=1` for edit mode).
- **"+ Place" sets the type from the km** (the server's ex/out-station limits) until the user picks one by hand; km comes before type in the form.
- **Row actions are words** (`ActionLinks`: "View · Edit · Deactivate"), accent for ordinary actions and red for deactivate / delete, instead of the "⋯" menu, in the Places table, Other routes and All routes. The narrow Zones/HQs tree keeps its "⋯".
- **The HQ town is 0 km, no TA**; its View shows what a day in the town pays (the HQ DA). "+ Place" shows the same pay chart, live, for the route it makes (the place's own type).
- **All routes filters:** Search, Zone → HQ (the HQ list follows the zone; choosing an HQ sets its zone), Type, Status (Active unless changed), and Clear filters. The "Any place" filter is gone.
- **Routes from an HQ town to itself are removed** (`migrate:drop-town-routes`): a day at one place needs no route, and an HQ place pays no TA (`calculatePlaceTaDa`), so no pay changes. Each goes through the normal permanent delete (history keeps its name from the archive); doctors and chemists on one move to another active route of that place first. New ones were already refused.

**Needs a migration:** yes — `pnpm --filter @greynote/api migrate:drop-town-routes` (dry run), then with `-- --apply`. Safe to repeat.

## 2026-11-27: Who holds doctors and chemists

**Decision.**
- **An MR who adds a doctor or chemist holds it once approved**: doctors as before (`AUTO_ASSIGN_DOCTOR_ON_APPROVAL`), chemists now behind their own setting, `AUTO_ASSIGN_CHEMIST_ON_APPROVAL` (default on). Off: Admin assigns it.
- **Managers don't hold doctors or chemists** unless `MANAGERS_CAN_HOLD_OUTLETS` is on (default off). A manager is any designation above MR (the same test planning uses). Assign, bulk assign (SKIPPED with the reason) and auto-assign on approval refuse a manager; managers keep seeing and calling their team's. Nothing already held is taken away: `migrate:manager-outlets` reports who holds some, for Admin to move from the employee page.
- **Office staff pick the MR when adding** on the web: `POST /doctors` and `POST /chemists` take an optional `assignToUserId`; a refused pick keeps the record and returns `assignError`.
- **Address is shown as "Area"** (the road or locality in the place) on the web and phone; the stored field stays `address`. Place comes first, then Area. The phone's add screens pick a **Place** (not a route) and send `placeId`; drafts saved with `routeId` still go through.

**Needs a migration:** no (`migrate:manager-outlets` only reports).

## 2026-11-27: MR daily plan at one place; chemists at the day's place

**Decision.**
- **A day at one place (From = To) can be saved** on the daily plan: it has no route and needs none (`SetDailyPlan.routesFor`). Before, it was refused as "no routes for this day".
- **The phone keeps an MR's doctor picks at the day's To place**, as the picker and the server do; it used to drop every pick not on the plan's route, so a From = To day lost them all.
- **A chemist call is made at the day's To place** (`CallChecks.chemistAtPlace`, refusal `CHEMIST_NOT_AT_PLACE`, which the phone lets the MR remove); the phone lists only those chemists. A chemist elsewhere gets a follow-up. Older days without places are not checked. The phone's chemist cache now reads `placeId`.

**Needs a migration:** no.

## 2026-11-27: A manager's day — work with the team approved at the same place, call their doctors

**Decision.**
- **Works with** on a manager's daily plan offers only the people below them whose **daily plan for that date is approved** and goes to the **same To place** (a field day). `ManagerScope.teamAtPlace`; `GET /planning/daily/work-with-options?date=` lists them with their planned doctors. The old rule (whoever holds the day's routes) is gone.
- **A manager picks no doctors.** Their doctors are the union of the doctors on the approved plans of the people they work with, worked out on every save and again on submit (`ManagerScope.teamDoctors`); a doctor list an older app sends for a manager is ignored. With nobody to work with, a manager's day has no doctors: they log follow-ups. `MANAGER_PLAN_DOCTORS_MAX` no longer applies to these plans.
- **No carry-over for managers** (`CarryOver.pending` is empty for them, so the snapshot's `owedDoctors` and the carry-over endpoint are too). MRs keep it.
- **A manager's doctor call** must be for a doctor on that day's plan (`CallChecks.managerCallOnPlan`, refusal `DOCTOR_NOT_ON_TEAM_PLAN`, removable on the phone). Any other team doctor is a follow-up.
- **Phone:** the manager's daily plan shows the Tour Plan's From → To, "Who you work with" from the new endpoint (with each person's doctor count), and the doctors read-only. `route-options` and `team-suggest` stay on the server for older builds.

## 2026-11-27: Follow-ups for anything unplanned

A doctor not on today's plan, or a chemist not at today's place, is logged from Follow-up as before (no extra link on the call screens). Follow-up rules are unchanged (geofence, field days only, visit gap).

**Needs a migration:** no.

## 2026-11-27: Call average and coverage

**Context.** The standard field-force numbers (call average; doctor coverage and frequency compliance over the MR's doctor list, the MCL) were not reported anywhere.

**Decision.** Per employee over whole months (`GET /reports/call-performance?fromMonth=&toMonth=&zoneId=&hqId=&managerId=`, `…/:userId/missed`):
- **Field working days**: counted daily reports — final by the `DCR_APPROVAL_REQUIRED` rule — whose planned day is Field Work or Doctor Campaign (a report with no plan row counts when it has calls). **Doctor / chemist call average** = calls on those days ÷ field days, one decimal.
- **Coverage** of the doctors held now: **doctor coverage** = met at least once ÷ held; **frequency coverage** = met at least frequency × months ÷ those with a frequency; **visit compliance** = Σ min(calls, frequency × months) ÷ Σ frequency × months; **never met** listed. Only the holder's own calls count.
- **Managers**: their own calls and averages; coverage is their team's (they hold no doctors). Totals count the MRs once.
- Admin reads everyone; a field employee themself and their downline. Shown on the web report (Excel and CSV), the Monthly Work Excel (Overview block), and the phone's Reports and team member screens.
- **Fix**: the Doctor visits report counted a doctor's calls by anyone; it now counts the employee's own, on counted reports (`callFigures`).

**Needs a migration:** no.
