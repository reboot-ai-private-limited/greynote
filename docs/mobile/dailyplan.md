# Mobile — Daily Plan

What the field app must do for the Daily Plan, and the rules the server enforces. The server is the authority: the phone's cached status is a UX gate only and may be stale. Companion to [`monthlyplan.md`](monthlyplan.md). Design background: [`LLD/planning.md`](../LLD/planning.md), [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md) (2026-10-12).

**Changing the day, 2026-10-14:** every field employee can now change the day's working type, work with and doctors while the plan is editable (section 1a, `POST /planning/daily/plan`); **routes and remarks stay the Monthly Plan's** (routes follow the working type, and a manager's follow the people they work with); the server keeps what the Monthly Plan said and flags the day "changed from monthly". A manager picks team members to work with, and the routes fill in from them and the doctors can be chosen from theirs (section 1b, `GET /planning/daily/team-suggest`). **This supersedes the doctors-only rule below and the 2026-10-13 phone note.** `POST /planning/daily/team-plan` (briefly there the same day) is replaced by `/planning/daily/plan`. The phone app has not built any of it yet.
**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against. **Changed 2026-10-12:** the phone must stop calling `POST /planning/daily`, `POST /planning/daily/:id/changes`, `GET /planning/daily/:id/changes` and `GET /planning/changes/:id` — all four are gone (404).
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** the Daily Plan keeps only the doctor picker with carried-over doctors; no create or change-request calls remain; it shows the deadline, resubmit and late windows, "There is no plan for this day", and "Need a change? Ask your manager"; a manager can amend a plan.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | A Daily Plan **starts from the approved Monthly Plan**: working type, routes, work-with and remarks are copied in as a draft. The employee can change the working type and work with (and the doctors), not the routes or remarks (section 1a). A date the Monthly Plan did not cover has no plan (and so no work that day). The weekly off and holidays can't be on the Monthly Plan (see [`monthlyplan.md`](monthlyplan.md) rule 18), so they have no Daily Plan either; a holiday HR adds after the month is approved gets none, while a Daily Plan already written for it stays. | ✅ |
| 2 | The employee changes the day (section 1a) while the plan is a draft, rejected, withdrawn or reopened; `POST /planning/daily/doctors` still sets only the doctors. Missed calls still owed from earlier days are added by the server and can't be dropped. | ✅ |
| 2a | **Doctors come only from the day's routes.** A doctor can be picked only if they are **assigned to this employee** (for a manager: to them or to a team member they work with, section 1b) and sit on **one of the routes the Monthly Plan gave that day**; any other id is refused with `400` on `doctorIds` (`publicDetails.doctorIds` lists them). The picker should offer only those doctors. The one exception is a missed call carried over from an earlier day: it stays on the list even if that day's routes differ. | ✅ |
| 3 | The employee **submits every day** (`POST /planning/daily/:id/submit`, online only, never queued). The manager approves, then Admin (unless `APPROVAL_MANAGER_ONLY_KINDS` lists `DAILY_PLAN`). Changing the doctors of a submitted or approved plan is not possible: ask the manager (rule 8). | ✅ |
| 4 | **Deadline:** `DAILY_PLAN_SUBMIT_CUTOFF_TIME` (default `10:00`) on the plan's own date, in `BUSINESS_TIMEZONE`. Show `submitDeadline` from the server; never compute it on the phone. | ✅ |
| 5 | After the deadline, submit is refused with `409 PLAN_SUBMIT_LATE` unless (a) the after-rejection resubmit window is open (`DAILY_PLAN_RESUBMIT_GRACE_MINUTES`, never past `DAILY_PLAN_RESUBMIT_LATEST_TIME`, at most `PLAN_RESUBMIT_GRACE_MAX` times) or (b) Admin granted a late-submission exception. | ✅ |
| 6 | **Late-submission exception for a Daily Plan:** Admin picks the end date-time (`expiresAt`); it can't be later than **the end of that plan's business day** (the next `DAY_START_TIME`, e.g. 02:00, less a millisecond). Without one it lasts `LATE_PLAN_GRANT_VALID_HOURS`, cut to the end of the day. A manager can grant it for their team only while `LATE_PLAN_GRANT_BY_MANAGER` is on. Used up by the submit. The phone shows `lateSubmitAllowedUntil`. | ✅ |
| 7 | **A missed daily report blocks the employee.** If the DCR for day *D* is not submitted by the next day start (`DAY_START_TIME`, e.g. 02:00), the server blocks the employee (once Admin sets `DCR_MISS_GRACE_DAYS` to `0`; the seeded `1` allows one miss). Weekly offs, holidays and approved leave don't count as missed. While blocked, nothing can be logged or submitted: `403` on a plan submit, `userBlocked` on logging. Leave requests and old reports stay readable. | ✅ |
| 8 | **Unblocking:** Admin, or any manager above the employee, clears the block and must give a reason; the reason, who and their role are kept as the audit trail. After an unblock the employee starts with a clean slate (days before the unblock are not judged again). The employee can't unblock themselves. | ✅ |
| 9 | **Changes to an approved plan are not made in the app.** The employee contacts their manager or Admin outside the app; the manager/Admin **amends** the day (`PATCH /planning/daily/:id/amend`, reason required, old body kept) until that day's report is submitted. | ✅ |
| 10 | **Nothing else can be done until the day's plan is approved.** Calls, orders and every other record of the day are refused with `planNotApproved` until the plan is `MANAGER_APPROVED` or `APPROVED`. Order of checks: not blocked → monthly plan approved (`MONTHLY_PLAN_NOT_APPROVED`) → day is today and matches the record → daily plan approved (`planNotApproved`) → the day's report isn't already submitted (`dcrLocked`). | ✅ |
| 11 | A call to a doctor not on the day's list, or on a route the plan doesn't list, is **saved and flagged** ("Not in plan" / "Route not in plan"); it is never refused for that. The config key `ALLOW_UNPLANNED_DOCTOR_CALLS` is removed. Calls and follow-ups are written up in [`dcr.md`](dcr.md). | ✅ |
| 12 | **Working types:** `FIELD_WORK`, `DOCTOR_CAMPAIGN`, `MEETING`, `CONFERENCE`, `STRIKE`. `FIELD_WORK` and `DOCTOR_CAMPAIGN` need at least one route and have doctors; the other three have neither. A doctor campaign pays DA (highest route type) and **no TA**. | ✅ |

## 1a. Changing the day (2026-10-14)

Any field employee can change their own Daily Plan's **working type, work with and doctors**, not only the doctors. **Routes and remarks are not theirs to change**: the Monthly Plan's routes and remarks stay. The Monthly Plan stays the plan of record: the server keeps what it said and shows the day as changed.

| # | Rule | Status |
|---|---|---|
| C1 | **Save:** `POST /planning/daily/plan` with `{ planDate, workingType, workWith[], doctorIds[] }` replaces the day's working type, work with and doctors together. No `routeIds` or `remarks` are sent (they are ignored if sent). The response is the whole plan with the routes the server set. `404` for a date the Monthly Plan did not cover. | ✅ |
| C2 | **Only while the plan can be edited:** a draft, rejected, withdrawn or reopened. Waiting for approval or approved: `409`; an approved day is still changed through the manager's amend (rule 9). The deadline, resubmit and late rules are unchanged: they apply to the submit. | ✅ |
| C3 | **Routes follow the working type, they are never chosen.** A field work or doctor campaign day has **the Monthly Plan's routes** (also after the day was switched to a meeting and back: the server remembers them). A manager who names team members to work with gets **those people's routes** instead (section 1b). Doctors: assigned to the employee (a manager: or to a named team member) and on the day's routes (rule 2a); anything else is `400` on `doctorIds`. | ✅ |
| C4 | **Working type decides what the day has.** `FIELD_WORK` and `DOCTOR_CAMPAIGN` have routes and doctors. `MEETING`, `CONFERENCE` and `STRIKE` have no routes and no doctors: switching to one clears them, and sending doctors with one is `400` on `doctorIds`. A doctor still owed from an earlier day stays owed for a later day. A day the Monthly Plan made a meeting (no routes) **can't become field work**: `400` on `workingType`, "The monthly plan has no routes for this day". A doctor campaign pays DA at the highest route type and no TA (rule 12). | ✅ |
| C5 | **A trip's stay and transit days keep their working type and routes** (`400` on `workingType` if the type is changed); work with and doctors can change. To change the trip, change its first day in the Monthly Plan. | ✅ |
| C6 | **A changed day is the employee's own** (`source: MANUAL`): approving the month again does not overwrite it. | ✅ |
| C7 | **"Changed from monthly".** The first change saves what the Monthly Plan said (`plannedFrom`: working type, routes, work with, remarks; the doctors are not part of it; a day whose work with or routes match it again is not changed) and sets `changedFromMonthly: true`. Later edits keep that first original. Saving the day back as the Monthly Plan wrote it clears both (`source` is `MONTHLY` again). The approver sees the flag and the original in the approval screen. | ✅ |
| C8 | **Submit, approval, gates and flags** are as before (rules 3–11). TA and DA follow the working type and routes the plan has when the report is approved. | ✅ |

**Phone screen:** working type and work with above the doctor picker, with **Save**; routes and remarks are shown read-only; a "Changed from monthly" chip and a "Show the monthly plan" line from `plannedFrom`; a **Back to monthly plan** action that saves the day as `plannedFrom` says. Changing the type to a non-field day empties and hides the routes and doctors (the server clears them); changing back to a field day shows the monthly routes again.

## 1b. A manager's Daily Plan (2026-10-14)

A **manager** is anyone whose designation is above MR (ASM, RSM, ZSM, NSM), whether or not they have a team yet (`isManager` is read on the server; the phone knows it from the profile's designation). A manager works with people from their team, so the rules above change for them:

| # | Rule | Status |
|---|---|---|
| M1 | The manager still has a Monthly Plan, and the day is created from it as a draft; they change it as in section 1a, and choose **Work With** from their team, which decides the routes (M3, M4). | ✅ |
| M2 | **Work With** is a multi-select of the manager's **whole downline** (any depth, active people only). Anyone else is refused with `400` on `workWith`. A non-MR with nobody below gets an empty list: show "No team members under you yet" and let them plan as an MR does (doctor picker only). | ✅ |
| M3 | Picking people fills the routes and doctors: `GET /planning/daily/team-suggest?date=YYYY-MM-DD&userIds=a,b` returns, per person, the routes and doctors of **their Daily Plan** for that date (`source: DAILY_PLAN`, with `planStatus`), else their Monthly Plan's routes and the doctors assigned to them on those routes (`source: MONTHLY_PLAN`), else nothing (`source: NONE`); plus the two lists merged (`routeIds`, `doctorIds`). The merged `routeIds` are the routes the day takes (the manager does not edit them; show them read-only); the merged `doctorIds` fill the doctor list, which the manager can add to or remove from. Show each person's `source`/`planStatus` so "not planned yet" is visible. | ✅ |
| M4 | **The day's routes** = the routes of the people named in Work With (their Daily Plan's, else their Monthly Plan's), set by the server on save. With nobody named the routes are the manager's own monthly ones. If none of the people named has a route planned that day the save is `400` on `workWith`. **Allowed doctors** = the manager's own plus those assigned to the people named, on those routes (`400` on `doctorIds` otherwise); offer only those in the picker. | ✅ |
| M5 | The fill is a **snapshot**. If a team member's plan changes later, the manager's list does not change; a **Refresh from team** button calls `team-suggest` again (the manager saves to apply the new routes, which the server recomputes from the people named). | ✅ |
| M6 | **Save:** `POST /planning/daily/plan` (section 1a), the same call as an MR's. For a manager `workWith` must be in the downline. | ✅ |
| M7 | **Doctor cap:** at most `MANAGER_PLAN_DOCTORS_MAX` (default 100) doctors on a manager's day; an MR's stays 50. `400` on `doctorIds` beyond it. | ✅ |
| M8 | **Submit, deadline, approval, gates, flags** are exactly as in rules 3–11: submit each day (`POST /planning/daily/:id/submit`); the manager's own manager approves, then Admin. The routes and doctors are checked again at submit against the team members named, so a route or doctor removed from a team member since the save fails the submit (`400`) until the manager saves again. | ✅ |
| M9 | The trip and non-field-day rules are those of section 1a (C4, C5). | ✅ |
| M10 | The `MANUAL` and "changed from monthly" rules are those of section 1a (C6, C7). | ✅ |

**Phone screen for a manager:** Work With picker (downline, search by name or code) → on pick, call `team-suggest` and fill → routes list and doctors list, both editable → remarks → Save → Submit. Also show who from the team is on leave or off (`/team/today`, [`team.md`](team.md)): the server does not stop a manager picking them.

## 2. Statuses

`DRAFT` → `SUBMITTED` → `MANAGER_APPROVED` → `APPROVED`. Also `REJECTED`, `WITHDRAWN`, `REOPENED` (the last three are editable — doctors only — and can be resubmitted). Treat `MANAGER_APPROVED` and `APPROVED` both as "approved": the server's gate counts both.

## 3. What the phone should show

From `GET /planning/daily?from&to` (and the sync snapshot):

| Field | Use |
|---|---|
| `status` | badge; whether the doctor picker and Submit / Withdraw are offered |
| `submitDeadline` | "Submit by …" in the business timezone |
| `resubmitAllowedUntil` | non-null: "You can still resubmit until …" |
| `lateSubmitAllowedUntil` | non-null: "Admin allowed a late submission until …" |
| `source` | `MONTHLY`: the day is as the Monthly Plan wrote it; `MANUAL`: the employee changed it |
| `changedFromMonthly`, `plannedFrom` | set once the employee changed the day: show "Changed from monthly" and, on request, what the Monthly Plan said (`plannedFrom`: working type, routes, work with, remarks) |
| `doctors` | the day's list; each with `carriedFrom` (a missed call carried over) |
| `amendments` | a manager's changes to the day, with reason |

- Past `submitDeadline` with neither window set: **"The deadline has passed. Ask Admin for a late-submission exception."** and disable Submit (still call the server — the phone's clock may be wrong).
- No plan for the date: **"There is no plan for this day. Ask your manager."**
- Approved plan: show it read-only, with **"Need a change? Ask your manager."** — no request button.
- Blocked (`403` on submit, `userBlocked` on logging): **"You're blocked for a missed daily report. Ask your manager or Admin to unblock you."**
- The doctor picker lists only the employee's assigned doctors on the day's routes (rule 2a).
- The Daily Plan screen has the working type, work-with (the list in [`monthlyplan.md`](monthlyplan.md) §5; for a manager their team) and the doctor picker, editable while the plan is (section 1a); the routes and remarks are shown but not editable. A trip's stay and transit days show their type locked.

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/planning/daily?from&to` | Own plans in a date range (≤ 93 days), with the state fields above. |
| `GET` | `/planning/daily/:id` | One plan (owner, their managers read-only, Admin). |
| `POST` | `/planning/daily/plan` | `{ planDate, workingType, workWith[], doctorIds[] }` — change the day's working type, work with and doctors (section 1a); the server sets the routes. `doctorIds` ≤ 50 for an MR, ≤ `MANAGER_PLAN_DOCTORS_MAX` for a manager. |
| `POST` | `/planning/daily/doctors` | `{ planDate, doctorIds[≤50] }` — set only the day's doctors; carried-over doctors are added. For a manager the doctors may also be a named team member's (section 1b). |
| `GET` | `/planning/daily/team-suggest?date&userIds=` | **Manager only:** the routes and doctors of the team members they would work with, from those people's plans (section 1b). `userIds` is comma-separated, at most 20, all in the manager's downline. |
| `GET` | `/planning/daily/carry-over?date=` | Doctors owed from earlier days. |
| `POST` | `/planning/daily/:id/submit` | Submit; online only. |
| `PATCH` | `/planning/daily/:id/amend` | Manager/Admin only: `{ …the whole day, reason }`. |
| `GET` | `/planning/late-grants` | Own late-submission exceptions (`status`, `expiresAt`). |
| `POST` | `/identity/users/:id/unblock` | Admin, or a manager above the employee: `{ reason }` (required). |

Removed 2026-10-12: `POST /planning/daily`, `POST /planning/daily/:id/changes`, `GET /planning/daily/:id/changes`, `GET /planning/changes/:id`, and the `DAILY_PLAN_CHANGE` approval kind and `DAILY_PLAN_CHANGE_MAX` setting (drop it from the phone's cached config).

Errors the screens must handle: `PLAN_SUBMIT_LATE` (409, `publicDetails.deadline`), `MONTHLY_PLAN_NOT_APPROVED` (409), `planNotApproved`, `userBlocked`, `dcrLocked`, "already waiting / already approved" (409), "plan changed while it was being submitted — reload" (409), blocked (403), `PLAN_DAY_REPORTED` (409, on amend), validation errors with `field`.
