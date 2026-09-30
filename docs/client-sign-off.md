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
`decision-log.md`; a later client answer is a change, not a gap).

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
| B6 | Can Admin override a locked/blocked DCR (§3.8)? | Yes — Admin can unblock an employee and approve any pending Plan/DCR directly | Built (unblock) / Designed |
| B7 | Attendance: is a day "present" on DCR **submit** or on DCR **approval** (§10.1)? | Not decided | Open |
| B8 | A Plan submitted after its deadline: refused, or accepted and flagged? | Refused, resubmits included — except that after a rejection the employee has a window: Daily 30 min, never after 11:30; Monthly 24 h, never after the month starts; at most 2 per Plan (all *config*). Beyond that, Admin (and a manager, if *config* `LATE_PLAN_GRANT_BY_MANAGER` is on) can grant a one-off exception for one Plan, valid for `LATE_PLAN_GRANT_VALID_HOURS` (*config*, 24) | Built |
| B9 | In-day changes to an approved Daily Plan (§2.6): who approves, on which days, how often? | Built and **confirmed 2026-09-29**: the employee's manager alone approves (Admin can override; top-of-chain goes to Admin); only today's plan, while its gate is open; a reason is required; one waiting change at a time; at most 3 applied per plan (*config* `DAILY_PLAN_CHANGE_MAX`); the plan stays approved and unchanged until the manager says yes | Accepted 2026-09-29 |

## C. Doctors, Chemists & Distributors (Phase 4)

| # | Question | Today | Status |
|---|---|---|---|
| C1 | Confirm one Doctor = one MR at a time; the MR's managers still see the Doctor (§4.5–4.6). | Yes | Designed |
| C2 | Confirm a Distributor has one assigned MR and one assigned ASM at a time. | Yes (assumed by analogy with C1) | Designed |
| C3 | When an MR's Route changes, does their Doctor visibility change automatically (§17.5)? | **Accepted 2026-09-29:** yes, by default — an MR who loses a Route stops seeing that Route's Doctors (their assignments are hidden, not deleted), and Admin assigns Doctors on the new Route by hand. A Doctor can only be assigned to an MR whose Routes include the Doctor's Route. Managers see their downline's Routes and Doctors. A switch (*config* `DOCTOR_VISIBILITY_FOLLOWS_ROUTE`, default on) turns it off, so an MR keeps their Doctors across a Route change | Accepted 2026-09-29 |
| C4 | MR-created Doctors need Admin approval before becoming active (§4.2) — confirm, and what fields can the MR fill? | **Approval answered 2026-09-24:** Employee → Manager → Admin. **Fields accepted 2026-09-29:** category, name, address, email, specialty, qualification, the Route (one of the MR's own) and the location, taken from the MR's phone GPS when adding, offline-first. Admin can correct the location while approving. On approval the Doctor is assigned to the MR who added it (*config* `AUTO_ASSIGN_DOCTOR_ON_APPROVAL`, default on); Admin can reassign later | Accepted 2026-09-29 |
| C5 | GPS validation radius (§5.5). Your document says **100 m**. | **100 m** (*config* `GEO_FENCE_RADIUS_METERS`, changed from a 200 m draft on 2026-09-29) — Admin can change it any time in System Config, no code change | Accepted 2026-09-29 |
| C6 | Doctor location captured by the MR on first visit then approved by ASM/Admin (§5.4, Master M4) — confirm this over "Admin enters it at creation". | **Changed 2026-09-29:** the MR's phone location is captured when the MR adds the Doctor and Admin reviews it at approval. When Admin adds a Doctor directly, Admin picks the location on a Google map | Accepted 2026-09-29 |
| C7 | New-Doctor waiting period before visits count toward coverage (§4.9, proposed 8 days). | **Accepted 2026-09-29:** 8 days from approval (*config* `NEW_DOCTOR_COVERAGE_WAIT_DAYS`). Phase 4 stores the approval date; how it enters the coverage figure (visits in the wait don't count, or the Doctor is left out of the total) is decided with Field Activity in Phase 6 | Accepted 2026-09-29 |
| C8 | Doctor Service types list (§6). | Not needed for Phase 4 — Doctor Services belong to Field Activity (Phase 6). Still to be provided by the client before then | Deferred to Phase 6 |

## D. Territory, TA & DA (Phases 2 and 6)

| # | Question | Today | Status |
|---|---|---|---|
| D1 | TA source: predefined Route distance only, or can Doctor GPS location be used (§7.1, §7.7)? | Route distance only | Designed |
| D2 | Night Stay allowance: when does it apply, and is it per grade? | Not modeled | Open |
| D3 | If one day's plan covers routes in different Area types (e.g. HQ and Out Station), which DA applies? | The highest (Out Station > Ex Station > HQ) | Designed |
| D4 | DA on Meeting / Conference days (no route). | HQ DA rate | Designed |
| D5 | Can a Route have a different Area Type from its Area? | **Answered 2026-09-24:** No — a Route always uses its Area's type | Confirmed |
| D6 | Is TA/DA paid on holidays / weekly offs (§8.5, §25.3)? | Not decided | Open |
| D7 | Is TA paid on a Route's one-way distance, or doubled for the return trip? | **Answered 2026-09-24:** used as-is, no ×2 — Admin enters the distance to cover the full paid travel | Confirmed |

## E. Sales & Distributors (Phase 6)

| # | Question | Today | Status |
|---|---|---|---|
| E1 | Monthly stock entry deadline for Primary and Secondary Sales (§14.5, §15.4). | The **last day of the month** the counts are for (28/29/30/31); `MONTHLY_STOCK_GRACE_DAYS` (default 0) can extend it. Chemists and Distributors alike | Designed 2026-09-30 (working assumption, awaiting client; was "5th of the following month") |
| E2 | After the deadline, can entries be re-opened? By Admin only, or through an approval? | Admin-only unlock, per month. After the deadline an entry is refused (409); the manager and Admin are shown which outlets are missing. **No DCR block** | Designed |
| E3 | Who enters Primary Sales: MR, ASM, or RSM (§14, S6 "configurable")? | Not decided | Open |
| E4 | Required fields for Primary (opening / purchase / closing, qty and/or value) and Secondary (§14–15). | Opening + closing qty per product | Designed |
| E5 | Distributor Order workflow after "Placed" (§16), and who marks it Done? | Placed → Done / Cancelled, by the MR who placed it (or Admin); built 2026-09-30. **New question E7:** is there a price list, or does the MR enter each unit price? | Built (working assumption) |
| E7 | Order unit prices: from a price list per Product, or entered by the MR? | Entered by the MR, as whole paise | Open |
| E6 | Distributor payment / collection: from your accounts system, or entered in this app (§16.8–16.9)? | Not decided | Open |

## F. Approvals, expenses, leave, HR (Phases 3, 4, 7)

| # | Question | Today | Status |
|---|---|---|---|
| F1 | Final list of activities that need approval (§19.3). | Plans, DCR, Leave, Doctor creation: immediate manager → Admin (Leave: → HR or Admin). Orders & stock: none. Whether each kind needs the Admin stage is *config* per kind | Partly answered |
| F2 | Expense categories and per-category limits (§9.2). | Not provided | Open |
| F3 | Leave entitlement per grade and probation rule (§11). | Per-grade defaults set by HR; **no probation rule** — leave is allocated once the employee's grade is set | Accepted 2026-09-28 |
| F4 | Employee statuses: Active / Inactive / Resigned / Suspended / Terminated — what does each allow (login, payroll)? | Active / Pending (onboarding) / Inactive | Built (partly) |
| F5 | Are grades fixed (G1–G3), or can Admin add more? | Fixed G1–G3 | Built |
| F6 | Per-grade PF %, ESIC %, Medical — confirm and give values. | Not modeled | Open |
| F7 | Salary override policy for Payroll (§21.5). | Not decided | Open |
| F9 | Leave approval: straight to HR, or through the manager (§11.2)? | **Answered 2026-09-24:** Employee → Manager → HR or Admin | Confirmed |
| F10 | After approval, can the employee edit? | **Answered 2026-09-24:** No — locked; Admin can override (reopen or edit) | Confirmed |
| F8 | Notifications: which go to the employee, their manager, and Admin (§23.3)? | Not decided | Open |
| F11 | Leave year: financial year (April–March) or calendar year? | Financial year, from *config* `FY_START_MONTH` | Accepted 2026-09-28 |
| F12 | Do the weekly off day and holidays inside a leave range count as leave days? | No — skipped (*config* `WEEKLY_OFF_DAY`, Sunday; holidays for the employee's HQ/Zone) | Accepted 2026-09-28 |
| F13 | Someone joining mid-year: full allocation or a share? | A share for the months left in the leave year, rounded to half days | Accepted 2026-09-28 |
| F14 | Half-day leave? | Yes — first or second half | Accepted 2026-09-28 |
| F15 | How far back can leave be applied (e.g. to cover a missed DCR, §7.5)? | 30 days (*config*), within the current leave year | Accepted 2026-09-28 |
| F16 | Leave request with too little balance? | Refused; Loss of Pay leave has no balance and is always allowed | Accepted 2026-09-28 |
| F17 | Your leave types, which are paid, and the days per grade. | Casual, Sick, Earned (paid), Loss of Pay (unpaid) as a starting list; HR enters the days per grade in the app | Open (data, not blocking) |

---

## What happens with the answers

Record each answer in [`decision-log.md`](decision-log.md) and update the affected ERD/HLD/LLD
docs, then mark the row confirmed here. A phase in the roadmap doesn't start until the rows it
depends on are answered or explicitly accepted as "build with today's assumption".

## G. Offline sync & geofencing (Phase 5)

| # | Question | Today | Status |
|---|---|---|---|
| G1 | When does the field app send its offline data? | Only when the MR taps the **daily report's Submit** with a live connection — one push for the whole day (Doctors added, calls, samples, follow-ups, expenses, orders, gifts done, service requests, monthly stock counts). Plans, Leave, approvals and login need a connection at the moment of the action. **Amended 2026-09-29 by G9:** nothing *counts* until Submit, but the phone also keeps a private backup copy on the server (below) | Accepted 2026-09-29 (amended by G9; confirmed 2026-09-29) |
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
| H1 | A call outside the radius (or with no reference location / a weak GPS reading): what can the manager do? | It is flagged, never refused. The reviewing manager can accept a flagged call with a required comment (`OVERRIDE`), separately from approving or rejecting the day | Accepted 2026-09-29 |
| H2 | If Admin rejects a DCR at the final stage after the manager approved it, what happens to its auto-calculated TA/DA? | The unpaid auto rows are cancelled; any already paid are left and reported | Accepted 2026-09-29 |
| H3 | Manual expenses (§9.2, see F2): limits and receipts? | No per-category limit and no receipt photo for now | Accepted 2026-09-29 (working assumption, F2 still open) |
| H4 | Doctor Service types (see C8). | Tour package, gift, online promotion, others | Accepted 2026-09-29 (working assumption, C8 still open) |
| H5 | The missed-DCR block: when does a day count as reported, and how is it triggered? | The DCR counts once submitted (see B7); an approved leave excuses the day; a script run daily by the operator applies the block, switchable with `DCR_MISS_BLOCK_ENABLED` | Accepted 2026-09-29 |
| H6 | How many missed days before the block, and which days don't count? | Blocked after missing **more than `DCR_MISS_GRACE_DAYS` working days in a row** (default 1 → the second consecutive miss; 0 → the first). The weekly off day, holidays and approved-leave days are skipped; days before joining, or before an Admin last cleared a block, are not counted | Designed 2026-09-29 (working assumption, awaiting client) |

