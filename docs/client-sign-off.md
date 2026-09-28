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
| B8 | A Plan submitted after its deadline: refused, or accepted and flagged? | Refused, resubmits included. Admin (and a manager, if *config* `LATE_PLAN_GRANT_BY_MANAGER` is on) can grant a one-off exception for one Plan, valid for `LATE_PLAN_GRANT_VALID_HOURS` (*config*, 24) | Designed |

## C. Doctors, Chemists & Distributors (Phase 4)

| # | Question | Today | Status |
|---|---|---|---|
| C1 | Confirm one Doctor = one MR at a time; the MR's managers still see the Doctor (§4.5–4.6). | Yes | Designed |
| C2 | Confirm a Distributor has one assigned MR and one assigned ASM at a time. | Yes (assumed by analogy with C1) | Designed |
| C3 | When an MR's Route changes, does their Doctor visibility change automatically (§17.5)? | Not decided | Open |
| C4 | MR-created Doctors need Admin approval before becoming active (§4.2) — confirm, and what fields can the MR fill? | **Approval answered 2026-09-24:** Employee → Manager → Admin. Fields the MR can fill: still open | Partly answered |
| C5 | GPS validation radius (§5.5). Your document says **100 m**. | **200 m** (*config*) — will change to 100 m on confirmation | Designed |
| C6 | Doctor location captured by the MR on first visit then approved by ASM/Admin (§5.4, Master M4) — confirm this over "Admin enters it at creation". | Admin enters at creation | Designed |
| C7 | New-Doctor waiting period before visits count toward coverage (§4.9, proposed 8 days). | Not decided | Open |
| C8 | Doctor Service types list (§6). | Not provided | Open |

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
| E1 | Monthly stock entry deadline for Primary and Secondary Sales (§14.5, §15.4). | 5th of the following month (*config*) | Designed |
| E2 | After the deadline, can entries be re-opened? By Admin only, or through an approval? | Admin-only unlock | Designed |
| E3 | Who enters Primary Sales: MR, ASM, or RSM (§14, S6 "configurable")? | Not decided | Open |
| E4 | Required fields for Primary (opening / purchase / closing, qty and/or value) and Secondary (§14–15). | Opening + closing qty per product | Designed |
| E5 | Distributor Order workflow after "Placed" (§16), and who marks it Done? | Placed → Done / Cancelled, by the MR | Designed |
| E6 | Distributor payment / collection: from your accounts system, or entered in this app (§16.8–16.9)? | Not decided | Open |

## F. Approvals, expenses, leave, HR (Phases 3, 4, 7)

| # | Question | Today | Status |
|---|---|---|---|
| F1 | Final list of activities that need approval (§19.3). | Plans, DCR, Leave, Doctor creation: immediate manager → Admin (Leave: → HR or Admin). Orders & stock: none. Whether each kind needs the Admin stage is *config* per kind | Partly answered |
| F2 | Expense categories and per-category limits (§9.2). | Not provided | Open |
| F3 | Leave entitlement per grade and probation rule (§11). | Per-grade defaults set by HR | Designed |
| F4 | Employee statuses: Active / Inactive / Resigned / Suspended / Terminated — what does each allow (login, payroll)? | Active / Pending (onboarding) / Inactive | Built (partly) |
| F5 | Are grades fixed (G1–G3), or can Admin add more? | Fixed G1–G3 | Built |
| F6 | Per-grade PF %, ESIC %, Medical — confirm and give values. | Not modeled | Open |
| F7 | Salary override policy for Payroll (§21.5). | Not decided | Open |
| F9 | Leave approval: straight to HR, or through the manager (§11.2)? | **Answered 2026-09-24:** Employee → Manager → HR or Admin | Confirmed |
| F10 | After approval, can the employee edit? | **Answered 2026-09-24:** No — locked; Admin can override (reopen or edit) | Confirmed |
| F8 | Notifications: which go to the employee, their manager, and Admin (§23.3)? | Not decided | Open |

---

## What happens with the answers

Record each answer in [`decision-log.md`](decision-log.md) and update the affected ERD/HLD/LLD
docs, then mark the row confirmed here. A phase in the roadmap doesn't start until the rows it
depends on are answered or explicitly accepted as "build with today's assumption".
