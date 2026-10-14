# Client Sign-off: Open Business Rules

Questions for Greynote Healthcare to answer before the phases that depend on them are built
(see the sign-off gate in [`roadmap.md`](roadmap.md)). They come from the client's own
`RULES BY GREYNOTE.docx` §31 ("rules that cannot be changed casually after development"), where
most answers are still blank, plus gaps found while comparing that document with what's built.

Each question states **what we built or assumed today**, so the client can reply "confirmed" or
give the change. An answer marked *config* can change later without code; anything else is
cheapest to change before the listed phase starts.

**Status key:** Built = already in code · Designed = in docs, not built · Open = no assumption yet
· Accepted = not answered by the client, but "Today" explicitly accepted to build on (recorded in
`decision-log.md`; a later client answer is a change, not a gap) · Retired = the question no longer
applies because the design changed (the decision-log entry says how).

---

## A. Login & devices (affects Phase 1, already built) — **answered 2026-09-24**

| # | Question | Answer | Status |
|---|---|---|---|
| A1 | Login method: employee code + password, or OTP (§20.1)? | Employee code + password, for now | Built |
| A2 | How many devices can a **field employee** use? | 2 (*config*: `MAX_REGISTERED_DEVICES_FIELD`) | Built |
| A3 | Is Admin approval needed for a new device? | Yes — **every** new phone, including the first, waits for Admin approval. At 2 phones, login is refused until Admin removes one; logging out doesn't free a slot. Admin can remove a phone or log it out. A rejected phone is blocked for 7 days (*config*: `REJECTED_DEVICE_TTL_DAYS`) | Built |
| A4 | Admin, HR and Accountant have no device limit? | Confirmed — no limit, no approval | Built |
| A5 | Password reset? | Admin only; sets a new password and logs the user out everywhere | Built |

## B. Plans & DCR (Phases 4 and 6)

| # | Question | Today | Status |
|---|---|---|---|
| B1 | Monthly Plan deadline day (§1.3). | 28th (*config*: `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE`) | Accepted 2026-09-28 |
| B2 | If the Monthly Plan is missed, is next month's DCR blocked (§1.4)? | Not decided | Open |
| B3 | Daily Plan deadline time (§2.2). | 10:00 (*config*: `DAILY_PLAN_SUBMIT_CUTOFF_TIME`) | Accepted 2026-09-28 |
| B4 | If the Daily Plan is missed, is that day's DCR blocked, or only a notification (§2.3–2.4)? | DCR blocked until the day's Plan is Manager-approved (`MANAGER_APPROVED` or `APPROVED`) | Accepted 2026-09-28 |
| B5 | Missed-DCR rule for 1 / 2 / 3 consecutive days (§3.7). | Block after 1 grace day (*config*), with an on/off switch | Designed |
| B6 | Can Admin override a locked/blocked DCR (§3.8)? | Yes — Admin **or the employee's manager** can unblock an employee (a reason is required and kept as audit, 2026-10-12), and Admin can approve any pending Plan/DCR directly | Built (unblock) / Designed |
| B7 | Attendance: is a day "present" on DCR **submit** or on DCR **approval** (§10.1)? | Not decided | Open |
| B8 | A Plan submitted after its deadline: refused, or accepted and flagged? | Refused, resubmits included — except that after a rejection the employee has a window: Daily 30 min, never after 11:30; Monthly 24 h, never after the month starts; at most 2 per Plan (all *config*). Beyond that, Admin (and a manager, if *config* `LATE_PLAN_GRANT_BY_MANAGER` is on) can grant a one-off exception for one Plan, valid for `LATE_PLAN_GRANT_VALID_HOURS` (*config*, 24) | Built |
| B9 | In-day changes to an approved Daily Plan (§2.6): who approves, on which days, how often? | **Removed 2026-10-12 (owner).** The employee no longer requests changes in the app; they ask their manager or Admin outside it, and the manager/Admin amends the day (B11). `DAILY_PLAN_CHANGE_MAX` is gone. | Superseded |
| B10 | Does a submitted DCR need approval? | A global switch, `DCR_APPROVAL_REQUIRED` (*config*, default on). Off: approved on submit, TA/DA generated then. The day's Plan must still be approved | Built 2026-10-03 (client's call) |
| B11 | How do Daily Plans relate to the Monthly Plan? | Written from the approved Monthly Plan as drafts. The employee can't edit them but still submits each day, and the manager still approves. A manager above them or Admin can amend a day on request (reason kept) until that day's DCR is submitted | Built 2026-10-03 (client's call) |
| B12 | Can a DCR depart from the day's Plan? | **Changed 2026-10-12:** yes, but it is flagged: a call to a doctor off the list or on a route the plan doesn't list is saved and marked ("Not in plan" / "Route not in plan") and counted in the DCR report. Earlier (2026-10-03) it was refused. A Meeting, Conference or Strike day has no calls | Built 2026-10-12 (client's call) |
| B13 | How long does an approver have? | 3 days (*config* `APPROVAL_SLA_DAYS`), measured per stage. Then the request is flagged overdue; nothing is auto-approved and Admin can always approve | Built 2026-10-03 (client's call) |
| B14 | A day's doctor list and missed calls | The MR picks the doctors for the day (count = calls due); doctors not called carry to later days' lists for the period set in *config* `CALL_CARRY_OVER_FOREVER` / `CALL_CARRY_OVER_DAYS` (default until month end); the full list is approved; the visit report shows the date first planned and never called | Built 2026-10-10 (client's call; the "which calls clear a doctor" rule is assumed) |
| B15 | A call to a doctor not on the day's plan | Always allowed and flagged "Not in plan" on the call and counted in the DCR report (the config key `ALLOW_UNPLANNED_DOCTOR_CALLS` was removed 2026-10-12). Same for a follow-up on a doctor off the list. No reason is asked of the MR. A plan that lists no doctors falls back to the route | Built 2026-10-10, setting removed 2026-10-12 (client's call) |

## C. Doctors, Chemists & Distributors (Phase 4)

| # | Question | Today | Status |
|---|---|---|---|
| C1 | Confirm one Doctor = one MR at a time; the MR's managers still see the Doctor (§4.5–4.6). | Yes | Designed |
| C2 | Confirm a Distributor has one assigned MR and one assigned ASM at a time. | Yes (assumed by analogy with C1). **Changed 2026-10-09 by the owner:** a Distributor has a list of assigned field employees of any designation, and one or more Routes of one Zone | Built 2026-10-09 |
| C3 | When an MR's Route changes, does their Doctor visibility change automatically (§17.5)? | **Accepted 2026-09-29:** yes, by default — an MR who loses a Route stops seeing that Route's Doctors (their assignments are hidden, not deleted), and Admin assigns Doctors on the new Route by hand. A Doctor can only be assigned to an MR whose Routes include the Doctor's Route. Managers see their downline's Routes and Doctors. A switch (*config* `DOCTOR_VISIBILITY_FOLLOWS_ROUTE`, default on) turns it off, so an MR keeps their Doctors across a Route change | Accepted 2026-09-29 |
| C4 | MR-created Doctors need Admin approval before becoming active (§4.2) — confirm, and what fields can the MR fill? | **Approval answered 2026-09-24:** Employee → Manager → Admin. **Fields accepted 2026-09-29:** category, name, address, email, specialty, qualification, the Route (one of the MR's own) and the location, taken from the MR's phone GPS when adding, offline-first. Admin can correct the location while approving. On approval the Doctor is assigned to the MR who added it (*config* `AUTO_ASSIGN_DOCTOR_ON_APPROVAL`, default on); Admin can reassign later | Accepted 2026-09-29 |
| C5 | GPS validation radius (§5.5). Your document says **100 m**. | **100 m** (*config* `GEO_FENCE_RADIUS_METERS`, changed from a 200 m draft on 2026-09-29) — Admin can change it any time in System Config, no code change | Accepted 2026-09-29 |
| C6 | Doctor location captured by the MR on first visit then approved by ASM/Admin (§5.4, Master M4) — confirm this over "Admin enters it at creation". | **Changed 2026-09-29:** the MR's phone location is captured when the MR adds the Doctor and Admin reviews it at approval. When Admin adds a Doctor directly, Admin picks the location on a Google map | Accepted 2026-09-29 |
| C7 | New-Doctor waiting period before visits count toward coverage (§4.9, proposed 8 days). | **Accepted 2026-09-29:** 8 days from approval (*config* `NEW_DOCTOR_COVERAGE_WAIT_DAYS`). Phase 4 stores the approval date; how it enters the coverage figure (visits in the wait don't count, or the Doctor is left out of the total) is decided with Field Activity in Phase 6 | Accepted 2026-09-29 |
| C8 | Doctor Service types list (§6). | Not needed for Phase 4 — Doctor Services belong to Field Activity (Phase 6). Still to be provided by the client before then | **Final 2026-10-06** (from the owner): Tour package, Gift, Online promotion, Others |

## D. Territory, TA & DA (Phases 2 and 6)

| # | Question | Today | Status |
|---|---|---|---|
| D1 | TA source: predefined Route distance only, or can Doctor GPS location be used (§7.1, §7.7)? | Route distance only | Designed |
| D2 | Night Stay allowance: when does it apply, and is it per grade? | **Answered 2026-10-12: not needed.** No separate Night Stay amount. A multi-day out-station trip is paid by the trip rule: stay days out-station DA with no TA, a transit day on the way back TA with ex-station DA | Confirmed |
| D3 | If one day's plan covers routes of different types (e.g. HQ and Out Station), which DA applies? | The highest (Out Station > Ex Station > HQ). The type is set on each Route (see D8) | Designed |
| D4 | DA on Meeting / Conference days (no route). | HQ DA rate | Designed |
| D5 | Can a Route have a different Area Type from its Area? | **Retired 2026-10-03:** there is no Area any more; the type is on the Route itself (D8). Was answered 2026-09-24: no | Retired |
| D6 | Is TA/DA paid on holidays / weekly offs (§8.5, §25.3)? | Not decided | Open |
| D7 | Is TA paid on a Route's one-way distance, or doubled for the return trip? | **Answered 2026-09-24:** used as-is, no ×2 — Admin enters the distance to cover the full paid travel | Confirmed |
| D8 | Territory shape and the Route distance. | **Accepted 2026-10-03:** `Zone → HQ → Route`, no Area. Each HQ has a base place (e.g. Siliguri); a Route is one destination (e.g. Naxalbari) and its distance is base place → destination, with Admin override. The DA type (HQ / Ex Station / Out Station) is set on the Route. Changing an HQ's base place recalculates its Routes except manually overridden ones | Designed |

## E. Sales & Distributors (Phase 6)

| # | Question | Today | Status |
|---|---|---|---|
| E1 | Monthly stock entry deadline for Primary and Secondary Sales (§14.5, §15.4). | The **5th of the following month** (*config* `MONTHLY_STOCK_DEADLINE_DAY`, default 5, 1–28), for Chemists and Distributors alike | Built 2026-10-03 (client's call; replaces the 2026-09-30 "last day + grace days" assumption) |
| E2 | After the deadline, can entries be re-opened? By Admin only, or through an approval? | Admin-only unlock, per month. After the deadline an entry is refused (409); the manager and Admin are shown which outlets are missing. **No DCR block** | Designed |
| E3 | Who enters Primary Sales: MR, ASM, or RSM (§14, S6 "configurable")? | Not decided | Open |
| E4 | Required fields for Primary (opening / purchase / closing, qty and/or value) and Secondary (§14–15). | Opening + closing qty per product | Designed **See K34 (2026-10-09): Admin can also enter the statement.** |
| E5 | Distributor Order workflow after "Placed" (§16), and who marks it Done? | Placed → Done / Cancelled, by the MR who placed it (or Admin); built 2026-09-30. **New question E7:** is there a price list, or does the MR enter each unit price? | Built (working assumption) |
| E7 | Order unit prices: from a price list per Product, or entered by the MR? | Entered by the MR, as whole paise | Open |
| E8 | What counts toward a Target's "achieved"; can an MR set their own Target? | Non-cancelled orders (placed or done) dated in the month; a campaign Target counts only orders inside the campaign's dates. Only Admin or a manager sets Targets (for themselves and their team) | Built (working assumption, awaiting client) **2026-10-09: the Sales Dashboard instead shows an achievement entered by hand per employee per month, and is also open to managers (their downline) — awaiting client.** |
| E6 | Distributor payment / collection: from your accounts system, or entered in this app (§16.8–16.9)? | **Entered in this app** (2026-10-09, the owner): Admin or Accountant records each payment (date, amount, mode, reference, note) against a distributor; shown with its orders on the distributor page | Built 2026-10-09 |

## F. Approvals, expenses, leave, HR (Phases 3, 4, 7)

| # | Question | Today | Status |
|---|---|---|---|
| F1 | Final list of activities that need approval (§19.3). | Plans, DCR, Leave, Doctor creation: immediate manager → Admin (Leave: → HR or Admin). Orders & stock: none. Whether each kind needs the Admin stage is *config* per kind | Partly answered |
| F2 | Expense categories and per-category limits (§9.2). | Not provided | Open |
| F3 | Leave entitlement per grade and probation rule (§11). | Per-grade defaults set by HR; ~~no probation rule~~ — superseded: probation is a per-employee switch set at onboarding (K6, 2026-10-12); in probation all leave is paid | Accepted 2026-09-28; amended 2026-10-12 |
| F4 | Employee statuses: Active / Inactive / Resigned / Suspended / Terminated — what does each allow (login, payroll)? | Active / Pending (onboarding) / Inactive | Built (partly) |
| F5 | Are grades fixed (G1–G3), or can Admin add more? | Fixed G1–G3 | Built |
| F6 | Per-grade PF %, ESIC %, Medical — confirm and give values. | Not modeled | Open |
| F7 | Salary override policy for Payroll (§21.5). | Not decided | Open |
| F9 | Leave approval: straight to HR, or through the manager (§11.2)? | **Answered 2026-09-24:** Employee → Manager → HR or Admin | Confirmed |
| F10 | After approval, can the employee edit? | **Answered 2026-09-24:** No — locked; Admin can override (reopen or edit) | Confirmed |
| F8 | Notifications: which go to the employee, their manager, and Admin (§23.3)? | **Partly answered 2026-10-12:** the Admin can send a message to an audience (Inbox, no push). **Answered 2026-10-12 for managers:** a manager is told in the Inbox of a new leave, monthly-expenses or new-doctor request from their team, of any request waiting past the approval turnaround, and of a team member blocked for missed reports (see K42). Which other events (target set, exception granted, call assigned, approval decided) notify the *employee*, and push, are still not decided | Partly answered |
| F11 | Leave year: financial year (April–March) or calendar year? | Financial year, from *config* `FY_START_MONTH` | Accepted 2026-09-28 |
| F12 | Do the weekly off day and holidays inside a leave range count as leave days? | No — skipped (*config* `WEEKLY_OFF_DAY`, Sunday; holidays for the employee's HQ/Zone) | Accepted 2026-09-28 |
| F13 | Someone joining mid-year: full allocation or a share? | A share for the months left in the leave year, rounded to half days | Accepted 2026-09-28 |
| F14 | Half-day leave? | ~~Yes — first or second half~~ Superseded 2026-10-05: whole days only | Accepted 2026-09-28; superseded |
| F15 | How far back can leave be applied (e.g. to cover a missed DCR, §7.5)? | 30 days (*config*), within the current leave year | Accepted 2026-09-28 |
| F16 | Leave request with too little balance? | Refused; Loss of Pay leave has no balance and is always allowed | Accepted 2026-09-28 |
| F17 | Your leave types, which are paid, and the days per grade. | Casual, Sick, Earned (paid), Loss of Pay (unpaid) as a starting list; HR enters the days per grade in the app | Open (data, not blocking) |

---

## What happens with the answers

Record each answer in [`decision-log.md`](decision-log.md) and update the affected ERD/HLD/LLD
docs, then mark the row confirmed here. A phase in the roadmap doesn't start until the rows it
depends on are answered or explicitly accepted as "build with today's assumption".

## I. Payroll (Phase 7)

| # | Question | Today | Status |
|---|---|---|---|
| I1 | Which month does a paid expense belong to in payroll? | The month it was **paid** (not the month it was reported), so a late payment lands in the next run and is never lost | Designed 2026-09-30 (working assumption, awaiting client) |
| I2 | Who generates and finalizes payroll? | Accountant and Admin; never HR | Designed 2026-09-30 (working assumption) |
| I3 | Can the current, unfinished month be generated? | No — only months that have ended | Designed 2026-09-30 (working assumption) |
| I6 | What CTC range (min–max a year) does each pay grade get, and are the grade names G1, G2 … or something else? | A CTC outside its grade's range is refused; names are free text (decision-log 2026-10-05) | Built; the actual ranges to be supplied by the client |
| I4 | An employee who joined (or left) mid-month: prorated salary? | Full monthly gross of the CTC, flagged on the run; no proration. Inactive employees are not in a bulk run | Designed 2026-09-30 (working assumption; proration rule awaiting client) |
| I5 | Statutory deductions (PF, ESIC, Medical) and salary overrides (see F6, F7). | Not modeled; net = base + TA/DA + reimbursement − leave deduction | Open |

## G. Offline sync & geofencing (Phase 5)

| # | Question | Today | Status |
|---|---|---|---|
| G1 | When does the field app send its offline data? | Only when the MR taps the **daily report's Submit** with a live connection — one push for the whole day (Doctors added, calls, samples, follow-ups, expenses, orders, gifts done, service requests; monthly stock counts are no longer collected from the phone — the Monthly stock tab was removed 2026-10-12). Plans, Leave, approvals and login need a connection at the moment of the action. **Amended 2026-09-29 by G9:** nothing *counts* until Submit, but the phone also keeps a private backup copy on the server (below) | Accepted 2026-09-29 (amended by G9; confirmed 2026-09-29) |
| G2 | How does the app refresh its cached Doctors, Routes, Products and balances? | A versioned snapshot per source, not a row-by-row delta (a delta can't see a Doctor appearing or vanishing when an MR's Routes change) | Accepted 2026-09-29 |
| G3 | For a record made offline, which time decides whether it was late? | The phone's creation time — not in the future beyond 10 min, not older than 7 days (*config* `SYNC_CLOCK_SKEW_MINUTES`, `SYNC_MAX_AGE_DAYS`) | Accepted 2026-09-29 |
| G4 | Where is the geofence radius set? | SystemConfig (`GEO_FENCE_RADIUS_METERS`, default 100 m), editable by Admin — see C5 | Accepted 2026-09-29 |
| G5 | A call to a Doctor or Chemist with no registered location — or with no GPS reading at all (`NO_GPS_READING`, built in step 3). | Status `UNVERIFIED`, flagged for the manager like a `FAIL` | Accepted 2026-09-29 |
| G6 | A weak GPS reading. | The phone sends its accuracy; worse than `GEO_MAX_ACCURACY_METERS` (100 m) → `UNVERIFIED` (low confidence), not `FAIL` | Accepted 2026-09-29 |
| G7 | Detecting spoofed / mock locations. | Not needed | Accepted 2026-09-29 |
| G8 | Money in the system: rupees with paise, or another unit? | Whole numbers of **paise** everywhere (₹1 = 100). Rates are paise (₹7.50/km = 750) | Accepted 2026-09-29 |
| G9 | Can the phone back up the day's unsent records automatically, so a lost or broken phone doesn't lose the day? | Yes, as a **private draft backup**: whenever the phone has a connection it uploads its draft records to a holding area on the server that no manager, Admin, report, count, stock, sample balance, Plan gate or compliance check can see. Submit is still the only commit. Logging in on a new phone restores the day's drafts. Drafts are deleted on a successful Submit and purged after a while (*config* `SYNC_DRAFT_TTL_DAYS`) | Accepted 2026-09-29 |
| G10 | On Submit, does the phone end up matching the server? | Yes — Submit sends the final records, the server commits them and returns *its* version of each (recomputed geofence, assigned ids, per-record failures), the phone replaces its local copies with those and refreshes its reference data. The server's answer wins | Accepted 2026-09-29 |

## H. Field Activity (Phase 6)

| # | Question | Today | Status |
|---|---|---|---|
| H1 | A call outside the radius (or with no reference location / a weak GPS reading): what can the manager do? | **Changed 2026-10-12:** it is **refused** (`NOT_AT_LOCATION`) and nothing is stored, for a doctor call, doctor follow-up, chemist call and chemist follow-up alike; so are no GPS, weak GPS and no registered location. Earlier: flagged, never refused, with a manager `OVERRIDE`, which now applies only to old records | Built 2026-10-12 (client's call) |
| H2 | If Admin rejects a DCR at the final stage after the manager approved it, what happens to its auto-calculated TA/DA? | The unpaid auto rows are cancelled; any already paid are left and reported | Accepted 2026-09-29 |
| H3 | Manual expenses (§9.2, see F2): limits and receipts? | No per-category limit and no receipt photo for now | Accepted 2026-09-29 (working assumption, F2 still open) |
| H4 | Doctor Service types (see C8). | Tour package, gift, online promotion, others | Final 2026-10-06 (C8 answered) |
| H5 | The missed-DCR block: when does a day count as reported, and how is it triggered? | The DCR counts once submitted (see B7); an approved leave excuses the day; a script run daily by the operator applies the block, switchable with `DCR_MISS_BLOCK_ENABLED` | Accepted 2026-09-29 |
| H6 | How many missed days before the block, and which days don't count? | Blocked after missing **more than `DCR_MISS_GRACE_DAYS` working days in a row** (default 1 → the second consecutive miss; 0 → the first). The weekly off day, holidays and approved-leave days are skipped; days before joining, or before an Admin last cleared a block, are not counted | Designed 2026-09-29 (working assumption, awaiting client) |

## J. Financial Year toggle (Phase 8)

| # | Question | Today | Status |
|---|---|---|---|
| J1 | How is a past financial year selected, and what can be done in it? | The app sends the year with each request; while a past year is selected everything is **read-only** (any save, approval or payment is refused), only signing in/out and refreshing the session still work | Designed 2026-09-30 (working assumption, awaiting client) |
| J2 | Which screens does it cover? | Daily reports, expenses, tour plans, leaves and leave balances, orders, payroll sheets, and the approval lists ("pending items"). Products, chemists, campaigns and holidays don't change with the year | Designed 2026-09-30 (working assumption) |
| J3 | An item still waiting for approval from a past year: who resolves it, and how? | Not handled by the toggle (it is read-only). Needs an Admin route to correct it before payroll — to be agreed | Open |
| J4 | Does everyone get the toggle (Admin, HR, Accountant on the web), or only field staff on the phone? | The server allows it for anyone; the screens decide | Open |


## K. Roadmap brief of 2026-10-05

| # | Question | Today | Status |
|---|---|---|---|
| K1 | Maximum km paid as TA for one Route | `TA_MAX_KM`, default 99, in SystemConfig; a longer Route is paid as 99 km | Accepted 2026-10-05 (from the owner) |
| K2 | When is a Route Ex-station or Out-station? | By distance: over `EX_STATION_MIN_KM` (15) → Ex-station; over `OUT_STATION_MIN_KM` (50) → Out-station; both in SystemConfig | Accepted 2026-10-05 |
| K3 | Can the creator pick a different type? | Yes, with a warning, never a block | Accepted 2026-10-05 |
| K4 | A day with several Routes: how is TA counted? | **Only the longest Route** is paid TA (at most `TA_MAX_KM` of it, at its own rate); the others get no TA. DA is still by the highest Route type | Accepted 2026-10-05 (from the owner) |
| K11 | What does a day earn, by type? | HQ Route: DA only. Field work on an Ex-/Out-station Route: TA and DA. Meeting / conference: DA only. Strike: nothing | Accepted 2026-10-06 (from the owner) |
| K5 | Salary on the 1st (previous month, no TA/DA), expense payout on the 15th | Two separate runs; salary slip shows the ESI number | Built 2026-10-06 (working assumption: expenses are paid by the month they were incurred) |
| K6 | All leave paid during the first 6 months; no half-day leave | Probation from the joining date; half-day removed | Half-day removed: **accepted 2026-10-05**. Probation: months from the joining date, per-employee override, `PROBATION_LEAVE_PAID` toggle, balance check skipped: **accepted 2026-10-05** (leave types to confirm) |
| K7 | Approvals after the date has gone | **Dropped 2026-10-05**: no cutoff, nothing is refused for being late | Dropped (from the owner) |
| K8 | Financial-year close | An explicit Admin "Close year" (and "Reopen") action; a closed year refuses payroll generate/finalize and expense payments for its months. Viewing is unaffected | Accepted 2026-10-06 (from the owner) |
| K12 | After an employee's salary for a month is finalized, can their leave in that month still change? | No: it is locked (daily reports and expenses stay open until the 15th payout). A setting, `LEAVE_LOCKED_AFTER_PAYROLL`, switches it off | Accepted 2026-10-06 (from the owner, with a setting) |
| K9 | Primary and secondary sales | **Restated 2026-10-07 by the owner:** primary = how much goes **to** the distributors and chemists (orders marked Done); secondary = how much **they sell on** (derived per outlet from its stock: opening + primary received − closing). Replaces "primary = to distributors, secondary = distributors to chemists" | Accepted 2026-10-07 (from the owner) |
| K10 | CTC against grade | **Changed 2026-10-06:** a grade holds no CTC range; the CTC is set per employee and is independent of the grade (promotion included) | Accepted 2026-10-06 (from the owner) |
| K13 | Promotion effective date | The 1st of a chosen month, never mid-month; future months are scheduled; a finalized month or closed year is refused | Accepted 2026-10-06 (from the owner) |
| K14 | A promoted manager's team | Cannot save the promotion until every direct report has a new manager, set per employee or per group ("stays with them" allowed, with a warning); nothing moves until the effective date. A distributor's assigned MR/ASM is listed and can be handed over too, but is optional (field-work roles keep their distributors) | Accepted 2026-10-06 (from the owner; distributors optional is my reading) |
| K15 | Team changes between scheduling and the 1st | The promotion still applies; anyone not in the plan stays with the promoted person and is listed under "Needs attention" | Accepted 2026-10-06 (from the owner) |
| K16 | Requests already waiting at the promoted manager | Stay with them until decided | Accepted 2026-10-06 (from the owner) |
| K17 | Leave on promotion | Leave is by financial year; a promotion keeps the current year's days and balance unchanged (the new grade's days apply from the next year); the promotion screen shows days used and deducted | Accepted 2026-10-06 (from the owner; reading of "show the deducted leave" to confirm) |
| K18 | Reports after a team move | Show the team as it was in that month; every manager change is kept as dated history | Accepted 2026-10-06 (from the owner) |
| K19 | Do ASM and above do field work? | Yes; their routes, doctors and plans stay with them on promotion | Accepted 2026-10-06 (from the owner) |
| K20 | Does an *absent* day (a working day with no report, no leave, no strike) reduce salary? | **Yes (owner, 2026-10-06):** an absent day is deducted like an unpaid-leave day (base ÷ 30). Proposed details: a setting `ABSENT_DEDUCTS_SALARY` switches it; strike and probation days are not deducted; paid leave and holidays never; unpaid leave is not counted twice; the payroll calendar lets HR turn a real absence into leave before payroll is finalized | Accepted 2026-10-06 (from the owner); see K26 for strike |
| K21 | Which orders count as primary? | **`DONE` only**, in the month the order was marked Done; `PLACED` shown as its own "placed, not yet done" column; cancelled never. Orders keep their current lifecycle (Placed → Done or Cancelled, by the MR who placed it or Admin) — the confirmation idea was dropped by the owner 2026-10-07 | Accepted 2026-10-07 (from the owner) |
| K22 | Value of primary and secondary | **Built 2026-10-07:** primary = the amounts written on the Done orders; secondary = the derived quantity × each product's **PTR** (a distributor sells to chemists); a product with no PTR is in the quantity but not the value. Owner to confirm | Built as proposed |
| K23 | Chemist orders taken by an MR | **Information only** (owner, 2026-10-07): in neither primary nor secondary, no supplying-distributor field, nothing sent on. Listed on the Orders page | Accepted 2026-10-07 (from the owner) |
| K24 | Who sees the Sales page and Reports | **Admin only** for now (the calendars stay Admin, HR, Accountant) | Accepted 2026-10-07 (from the owner) |
| K25 | Calendar day priority | Proposed: holiday, weekly off, leave, strike, present, absent (first match wins); a Meeting or Conference day is present only with a submitted report | Open |
| K26 | Strike days and salary | **Not deducted by default**, switched by a global setting `STRIKE_DEDUCTS_SALARY` (default off). Absent days are switched by `ABSENT_DEDUCTS_SALARY` (default on). Probation days are deducted when absent (assumption; a third setting can be added) | Accepted 2026-10-06 (from the owner) |
| K27 | Reports: period | Every report is for the **financial year in view** (April to March), by month; no free date range | Accepted 2026-10-07 (from the owner) |
| K28 | Reports: which and how | Four reports — **Sales** (primary and secondary), **Stock**, **TA/DA**, **DCR** — with the DCR report counting calls only (no sample quantities), no "unusual claim" flag, CSV export | Accepted 2026-10-07 (from the owner) |
| K24a | Employee's own reports | An employee reads their own TA/DA and DCR (`/reports/me/*`) for the financial year in view; current year by default, older years read-only via the year switch | Assumed 2026-10-12 (awaiting owner) |
| K29 | Sales chart | A bar graph of the financial year: for each month (Apr … Mar) a **primary** bar beside a **secondary** bar | Accepted 2026-10-07 (from the owner) |
| K30 | Salary report | A fifth report, by month for the financial year in view: employee × month net payable, totals per month (base, leave deduction, absent deduction, net, employees paid), and a stacked bar of net salary + TA/DA + reimbursements per month (switch: deductions). A "cost to company" column adds the employer EPF/ESI. Finalized runs are the figures; draft months are drawn hatched, labelled draft and left out of the totals. Admin only, CSV | Accepted 2026-10-07 (from the owner) |
| K31 | Primary and secondary | Primary = **Done orders to distributors** (month marked Done); secondary = what the distributors sell on, derived from their stock (opening + primary − closing). Chemist stock counts stay as information in the Stock report, not in the sales chart | Accepted 2026-10-07 (from the owner) |
| K32 | Confirming an order instead of marking it done | **Withdrawn by the owner 2026-10-07:** orders stay Placed → Done or Cancelled as now | Withdrawn |
| K33 | Orders page | An Admin **Orders page** for the financial year in view: orders to distributors (with Done / Cancel for Admin, as the API already allows) and chemist orders as information; filters for month, outlet, MR and status; CSV | Proposed 2026-10-07 |
| K34 | Distributor monthly statement | **2026-10-09, from the owner:** opening, primary, secondary and closing are per **distributor and product**, per month (chemists are not counted). Field workers submit opening and closing from the phone; **Admin also enters the distributor's own sales statement** on the web — opening, the secondary the distributor reported, and an **adjustment** to primary (supply outside an app order, or a return) with a reason. A statement is the figure the reports use; the field count then only raises a mismatch flag. Adjustments are valued at the product's PTS. "Opening" is read as the stock at the month's start — owner to confirm | Built 2026-10-09 (awaiting confirmation of "opening") |
| K35 | Employee targets and secondary | **2026-10-10, from the owner:** targets are per employee **and product** over a run of whole months (month, quarter, year, custom) of a financial year, set by Admin or manager, in rupees at PTR. **Achievement = the secondary the employee enters** (no distributor), not a typed figure. An employee's **primary = their Done distributor orders**, which Admin can adjust with a reason. Distributor stock stays separate (K34); opening follows last month's closing | Built 2026-10-10 (supersedes the typed achievement of 2026-10-09; migration not run) |
| K36 | Visuals shown to each doctor | **2026-10-10, from the owner:** every product can have its own visuals, and general ones exist too. An MR picks a doctor, ticks the visuals to show and submits; the picks are one standing list per doctor. **The MR can only add** — earlier picks show ticked and locked — and **managers above the MR and Admin can see and remove** them. A **Show** button opens the doctor's visuals. To confirm: a reassigned doctor keeps its list for the new MR; the list is not tied to a call or DCR; which managers need a screen to remove picks (the phone shows only the MR's own doctors) | Built 2026-10-10 (awaiting confirmation) |
| K37 | Monthly expense statement | **2026-10-10, from the owner:** expenses are not part of the DCR. Employees add dated entries in one "Other" category; TA and DA are worked out; a month shows date-wise TA, DA, Other and total. The employee sends it **after the month ends**; the **manager or Admin** approves (either alone); Admin approves from the 1st for the previous month. Only an approved month is paid. Earlier months stay visible with their approval | Built 2026-10-10 (awaiting confirmation; migration not run) |
| K38 | Doctor visit frequency and missed calls | **2026-10-10, from the owner:** a doctor has an optional date of birth, anniversary and a monthly visit frequency (1–6). The phone shows how many visits are made and how many are missed against it; managers and Admin see the progress. To confirm: frequency is a standing monthly value (not set per month); only submitted/approved daily reports count; MRs set the fields when adding a doctor, Admin and managers can change them later | Built 2026-10-10 (awaiting confirmation) |
| K39 | Proof on an Other expense | **2026-10-10, built on our own assumption:** an employee may attach up to 3 files (PDF, JPG or PNG, 5 MB each) to an Other expense, optional, while the month is still editable. The approver and the Accountant can open them | Built 2026-10-10 (awaiting confirmation) — is proof compulsory above some amount? |
| K40 | Calls and follow-ups redesign | **2026-10-12, from the owner:** doctor call, doctor follow-up, chemist call and chemist follow-up all need the phone's GPS within the radius (100 m, system config) or they are refused. Work type comes from the plan (not chosen on the call) and each record shows the route type (HQ / Ex-station / Out-station). Off-plan doctors, follow-ups and off-route chemists are flagged for the report, not refused. New work type **Doctor campaign** (DA at the highest route type, no TA). Meeting, Conference and Strike days have no calls but still submit a daily report (a note is required for Meeting and Conference). An employee can remove a call or follow-up before the final submit, after an "Are you sure?" in the app | Built 2026-10-12; **assumed:** follow-ups use the same strict location rule as calls, and a doctor or chemist with no registered location cannot be recorded until Admin sets it |
| K41 | Expense deadlines and late exception | **2026-10-12, from the owner (our reading, to confirm):** the monthly statement must be sent by day 7 and approved by day 10 of the next month (*config* `EXPENSE_SUBMIT_CUTOFF_DAY`, `EXPENSE_APPROVAL_CUTOFF_DAY`). Later, only an Admin (or a manager, if `LATE_EXPENSE_GRANT_BY_MANAGER` is on) exception lets it through. The exception cannot be given, nor the month reopened, once any of it is paid. A missed month is not rolled over. | Built 2026-10-12 (assumed days 7 / 10; owner to confirm) |
| K42 | Manager Team section | **2026-10-12, from the owner:** managers use the phone only (no web); they see the whole team by default, read-only below their direct reports, and decide only for direct reports. Never any salary or CTC. Admin only approves on behalf of an absent manager. "Not started" = no calls or follow-ups by 11:00 (Admin setting `TEAM_NOT_STARTED_AFTER`). Inbox alerts: blocked and overdue always; new leave, monthly expenses and new doctors; plans and daily reports only in the badge. Design: `mobile/team.md` | Accepted 2026-10-12 (from the owner) |

## L. Docs tab of 2026-10-12

| # | Question | Today | Status |
|---|---|---|---|
| L1 | Which payslips can an employee see? | Their own, finalized months only, for the financial year in view; older years by switching year | Working assumption |
| L2 | Who can add documents, and who sees them? | Admin only; for every field employee or chosen people; PDF/JPG/PNG up to 10 MB; remove and add again to change | Working assumption |
| L3 | What does a closed financial year do on the phone? | Daily work dated inside it is refused (`FY_CLOSED`) and the phone shows a read-only notice. A year can be closed only after it ends | Working assumption |


## M. Manager's day and target of 2026-10-14

| # | Question | Today | Status |
|---|---|---|---|
| M1 | Who is a manager? | Anyone whose designation is above MR (ASM, RSM, ZSM, NSM), with or without a team | Working assumption |
| M2 | How does a manager plan the day? | They keep the Monthly Plan; each day they choose team members to work with (whole downline) and the routes and doctors fill in from those people's plans; they can edit the lists and submit as usual | Working assumption |
| M3 | How many doctors can a manager's day list? | 100 (Admin setting `MANAGER_PLAN_DOCTORS_MAX`); an MR's stays 50 | Working assumption |
| M4 | What is a manager's target and achievement? | The total of every MR in their team; a manager cannot be given a target; targets already set on managers are ignored, not deleted | Working assumption |
| M5 | A distributor handed to two MRs of one manager | Counts for each, so the manager's achievement can be more than the distributor sold | Working assumption |
| M6 | An MR who changes manager mid-month | Counts wholly for the manager they have now | Working assumption |
