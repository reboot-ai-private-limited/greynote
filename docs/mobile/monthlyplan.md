# Mobile — Monthly Plan and Work With

What the field app must do for the Monthly Plan, and the rules the server enforces (the Daily Plan is in [`dailyplan.md`](dailyplan.md)). The server is the authority: the phone's cached status is a UX gate only and may be stale. Design background: [`LLD/planning.md`](../LLD/planning.md), [`decision-log.md`](../decision-log.md).

**Manager edits a waiting plan, 2026-10-23 (server built; the phone has not built any of it):** a manager above the employee, or Admin, can now change the employee's Monthly Plan while it is `SUBMITTED` (rule 19, `PATCH /planning/monthly/:id/amend`, section 5). The employee is sent a push and sees the change in `amendments`. What the phone must build is in section 6.
**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the Tour Plan with day entries, out-station trips (`returnDate`, stay and transit days), deadline and resubmit and late windows, rejection reason, and Work With from `/identity/work-with`.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | One Monthly Plan per employee per month: up to 31 day entries, each with a working type (`FIELD_WORK`, `DOCTOR_CAMPAIGN`, `MEETING`, `CONFERENCE`, `STRIKE`), routes, work-with people and remarks. Field work and doctor campaign need routes; the others have none. | ✅ |
| 2 | **Deadline** for month *M* = the end of the business day of `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` (default the 28th) **of the month before**. | ✅ |
| 3 | The business day follows the **global day start** (`DAY_START_TIME`, e.g. `02:00`) in `BUSINESS_TIMEZONE`. With `02:00`, the 28th ends at **01:59:59.999 on the 29th**, not at midnight. Never compute this on the phone — show `submitDeadline` from the server. | ✅ |
| 4 | Save is free while the plan is a draft, and works **offline**. **Submit needs a live connection** (it is never queued). | ✅ |
| 5 | The month goes to the manager as **one unit** (no per-day status). **One approval is enough (2026-10-23):** the manager approves, or Admin does in their place, whoever acts first, and the plan is `APPROVED`. There is no second Admin step. | ✅ |
| 6 | A submitted or approved plan is **frozen**. Editable again only after a rejection, a withdrawal, or an Admin reopen. | ✅ |
| 7 | After the deadline, submit is refused with `409 PLAN_SUBMIT_LATE` unless one of: (a) the after-rejection resubmit window is open, (b) Admin granted a late-submission exception. | ✅ |
| 8 | **Resubmit window** after a rejection: `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` (default 24 h), at most `PLAN_RESUBMIT_GRACE_MAX` times (default 2), and **never after the month has started**. | ✅ |
| 9 | **Late-submission exception**: Admin can allow one employee to submit one plan after its deadline, once. A manager can too, for their team, only while `LATE_PLAN_GRANT_BY_MANAGER` is on. Used up by the submit. | ✅ |
| 10 | The exception ends at an **exact date and time Admin picks** (`expiresAt`, an ISO date-time), in the future and within `LATE_PLAN_GRANT_MAX_HOURS` (default 744 h) of now, else 400 on `expiresAt`. Without one it lasts `LATE_PLAN_GRANT_VALID_HOURS` (24 h) from the grant. Admin grants it on the web (**Late submissions**). | ✅ |
| 11 | When the month is approved, each entry from **today onward** becomes that day's Daily Plan (`source: MONTHLY`, a draft). The employee can **change its working type, work with and doctors** (not the routes or remarks) while it is editable, and still **submits it each day** and the manager still approves it - see [`dailyplan.md`](dailyplan.md) section 1a (2026-10-14). The server keeps what this plan said (`plannedFrom`) and the day shows "changed from monthly". A manager also chooses Work With from their whole team (section 1b). A changed day becomes `MANUAL` and is not overwritten if the month is approved again. | ✅ |
| 12 | **No approved Monthly Plan = no work that month.** Daily plans for the month can't be saved or submitted, and nothing can be logged. Refused with `MONTHLY_PLAN_NOT_APPROVED` (REST `409` on saving or submitting a daily plan, `publicDetails.planMonth`; a sync record or DCR submit is refused with the same code). The month of a day is its business date's month. A new joiner or anyone who missed the deadline asks Admin for a late-submission exception. Applies to every month, including the current one. | ✅ |
| 13 | A blocked employee (missed reports) cannot submit; the server says so. | ✅ |
| 14 | Every route must be one of the employee's own active routes; every work-with person must be an active employee; nobody lists themselves or a person twice. | ✅ |
| 15 | **The routes chosen here decide the day's doctors.** The Daily Plan inherits each day's routes; the employee can then pick doctors only if they are **assigned to them and on that day's routes** (a manager's daily plan may also use the routes and doctors of the team members they work with; the Monthly Plan itself still takes only their own routes) (otherwise `400` on `doctorIds`). A missed call carried over from an earlier day is the one exception. So choose the routes carefully: a doctor on a route not planned for the day can't be added. See [`dailyplan.md`](dailyplan.md) rule 2a. | ✅ |
| 16 | **Out-station trip.** On the day the employee leaves, an entry may carry `returnDate` (after `planDate`, this month or the next, field work or doctor campaign, with at least one out-station route). The server writes the days in between as `dayKind: STAY` and the return day as `dayKind: TRANSIT`, copying the trip's routes, work-with and remarks. Leave `returnDate` empty for a same-day return: that is an ordinary day. Send the entries back as they were read (stay/transit days included) or without them; the server rebuilds them from the trip. A trip can't run over another planned day and can't return later than the month after. **A trip that crosses a month end** also writes its stay/transit days into the next month's plan (made as a draft if it has none); that month still needs its own submit and approval by its own deadline. Saving is refused (`400`) if one of those days is already planned there, and (`409`) if the next month's plan is waiting or approved. Cutting the trip short removes the days again. A `returnDate` on a trip with no out-station route is refused at submit (`400` on that day's `routeIds`). | ✅ |
| 17 | **What the days earn** (once each day's report is approved): trip day = TA + out-station DA; stay day = out-station DA, no TA; transit day = TA + **ex-station** DA. Each stay and transit day is a normal working day: it needs its own approved Daily Plan (inherited) and a submitted DCR, and calls may be made on it. The phone shows them as locked trip days; to change a trip, edit the first day. | ✅ |
| 18 | **Weekly off and holidays are locked (2026-10-22).** The employee's **weekly off day** (e.g. every Sunday) and every **holiday that applies to their main HQ** (National, their main HQ's, or its Zone's; for a manager, *not* the other HQs and Zones they cover) are shown already filled in as **"Weekly off"** or **"Holiday · Durga Puja"** and **can't be planned or changed**. The server lists them in `offDays` (section 3) and refuses an entry on one with `400` on `entries.N.planDate`, and a trip that runs over one (stay or return day) with `400` on `entries.N.returnDate`; the message names the day, e.g. "Fri, 2 Oct is a holiday (Gandhi Jayanti), so it can't be planned." The screen should not offer those days at all: show them greyed with the label, and keep a trip's date pickers off them. **Submit checks again**: if HR adds a holiday after the plan was saved, the submit is refused the same way; the employee takes the day out and submits. In an approved month, a holiday added later gets no Daily Plan (one already written stays). | ✅ server; 📱 phone to show |
| 19 | **A manager can edit a plan that is waiting for them (2026-10-23).** Anyone above the employee in the chain, and Admin, can change **any day** of a `SUBMITTED` plan: working type, routes, work with, remarks, trips. Never the employee, never on their own plan. A reason is required. The whole month is sent (as for a save) and checked like the employee's own: off days (rule 18), trips (rule 16, also into next month), the employee's own active routes and work-with people (rule 14). The plan **stays `SUBMITTED`**: the manager then approves or rejects it as usual. The days it replaced are kept in `amendments` (oldest first). Not allowed on a draft or rejected plan (the employee edits those: `409`) or one the manager has already approved (`MANAGER_APPROVED`, `APPROVED`): `409` "Ask Admin to reopen it" — Admin reopens, the employee or manager changes it, and it goes through approval again. Days are copied into Daily Plans only once the manager has approved, so an edit made while waiting never has to be chased into them. | ✅ server; 📱 phone to build |

## 2. Statuses

`DRAFT` → `SUBMITTED` → `MANAGER_APPROVED` → `APPROVED`. Also `REJECTED`, `WITHDRAWN`, `REOPENED` (the last three are editable and can be resubmitted). Treat `MANAGER_APPROVED` and `APPROVED` both as "approved" for the user's purposes; the server's gate counts both. **Single approval (2026-10-23):** new and resubmitted requests no longer pass through `MANAGER_APPROVED`: the manager's approval, or Admin's, ends at `APPROVED`. Old rows were moved to `APPROVED`, but keep treating `MANAGER_APPROVED` as approved. So the phone's wording "Approved by your manager", "Waiting for Admin" and "With Admin" no longer applies to these plans: show a plain **Approved**, and for `SUBMITTED` **Waiting for approval** (the manager or Admin).

## 3. What the phone should show

From `GET /planning/monthly?from=YYYY-MM&to=YYYY-MM` (each row):

| Field | Use |
|---|---|
| `status` | badge; whether Edit / Submit / Withdraw are offered |
| `submitDeadline` | "Submit by …" in the business timezone (rule 3) |
| `resubmitAllowedUntil` | non-null: "You can still resubmit until …" |
| `lateSubmitAllowedUntil` | non-null: "Admin allowed a late submission until …" |
| `approval` | who/when it was submitted and decided |
| `amendments` | a manager's or Admin's changes while the plan waited, oldest first: `[{ by, at, reason, previous }]`, `by` the user id, `previous` the entries it replaced. Show **"Edited by your manager"** with the reason, and on request what the day was before (look `previous[].routeIds` up in the plan's `routes`, section 4). |
| `offDays` | the month's locked days for this employee, as they stand now: `[{ date, reason, name }]`, `reason` `WEEKLY_OFF` or `HOLIDAY` (a holiday on the weekly off reads as the holiday), `name` the holiday's name (several joined with " / "), `null` for a weekly off. Show each as a locked row (rule 18). |

- Past `submitDeadline` with neither window set: show **"The deadline has passed. Ask Admin for a late-submission exception."** and disable Submit. (Still call the server — the phone's clock may be wrong.)
- On `PLAN_SUBMIT_LATE` show the same message with `publicDetails.deadline`.
- A rejected plan shows the rejection reason (from the approval request) and a Resubmit button while `resubmitAllowedUntil` is set.
- **Locked days offline, and for a month with no plan yet:** the sync snapshot's `planning.planOffDays` lists this month's and next month's locked days (same shape as `offDays`). Use it, **not** the HR holiday list: that one follows every HQ the employee covers, which for a manager is wider than what locks the plan.
- With no approved plan for the month, the Daily Plan and call screens show **"Your monthly plan for <month> isn't approved yet."** and a link to the Monthly Plan screen.

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/planning/monthly` | Save the whole month (draft). Body `{ planMonth: "YYYY-MM", entries: [{ planDate, workingType, routeIds, workWith, remarks, returnDate? }] }` (entries read back also carry `dayKind`: `NORMAL`, `STAY`, `TRANSIT`)`, ≤ 31 entries, each date inside the month, no date twice. |
| `GET` | `/planning/monthly?from&to` | Own plans, ≤ 12 months, with the state fields above. |
| `GET` | `/planning/monthly/:id` | One plan, also `amendments`. Also `routes[{id,name,routeType}]` (2026-10-22; from 2026-10-23 also the routes of the days an amendment replaced): every route the entries and `previous` days name, once each; look an entry's `routeIds` up in it. |
| `POST` | `/planning/monthly/:id/submit` | Submit; online only. |
| `GET` | `/planning/monthly/:id/routes` | The routes the plan's owner covers (active), named and typed, for the manager's route picker (2026-10-23). Owner, anyone above them, Admin. |
| `PATCH` | `/planning/monthly/:id/amend` | Manager above the employee, or Admin; online only. Body `{ entries: [...as a save, the whole month], reason }`, `reason` required (≤ 500). Returns the plan as `GET /:id` does. See rule 19. |
| `GET` | `/identity/work-with` | Work-with candidates (below). |
| `GET` | `/planning/late-grants` | Own late-submission exceptions (`status`, `expiresAt`) — the same time the plan row's `lateSubmitAllowedUntil` shows. |

Errors the screen must handle: an entry or trip on a locked day (400 on `entries.N.planDate` / `entries.N.returnDate`, rule 18), `PLAN_SUBMIT_LATE` (409), `MONTHLY_PLAN_NOT_APPROVED` (409), "already waiting / already approved" (409), "plan changed while it was being submitted — reload" (409), blocked (403), validation errors with `field` (e.g. `entries.3.routeIds`).

On amend: `403` the employee amending their own plan; `404` the plan isn't one of your team's; `409` the plan is a draft or was rejected ("the employee can edit it"), is approved ("Ask Admin to reopen it"), changed while you were editing ("Reload it and try again"), or a trip runs into a next-month plan that is waiting or approved; `400` a reason is missing, or a day is invalid (a route that isn't the employee's, a locked day, an overlapping trip), with `field`.

## 6. What the phone needs to build for the manager edit (2026-10-23)

| # | Item | Status |
|---|---|---|
| M1 | On the approval screen of a `MONTHLY_PLAN` request in `SUBMITTED` (the manager's own turn), offer **"Edit plan"** to a manager above the employee. Not for `MANAGER_APPROVED`/`APPROVED`, and not to the employee. Online only. | phone |
| M2 | The edit screen shows the employee's month (`GET /planning/monthly/:id`) with every day editable, including trips and locked off days as in rule 18. Save sends the **whole month** and a **required reason** to `PATCH /planning/monthly/:id/amend`. After it, show the plan again and let the manager approve or reject as before. | phone |
| M3 | **Routes.** To let the manager pick routes, call `GET /planning/monthly/:id/routes` (online): the employee's active routes, `[{ id, name, routeType }]` by name, readable by the plan's owner, anyone above them and Admin. Offer exactly these; the server refuses any other route (`400` on `entries.N.routeIds`). | phone |
| M4 | Show `amendments` on the plan for the employee and for later approvers: who (`by`), when (`at`), the reason, and the previous days. | phone |
| M5 | Handle the amend errors above. On "plan changed while you were editing", reload and let the manager redo it. | phone |
| M6 | The employee receives a push (`PLAN_AMENDED_MONTHLY_PLAN`, opens `/plan/monthly`) — see [`notifications.md`](notifications.md). The plan they see after it is the edited one; no action is needed from them. | phone |

## 7. A ZSM with a Zone and no HQ sees every route in it (fixed 2026-10-23)

**Symptom.** A ZSM is added with a Zone (or two) and no HQ ticked, which should mean *every HQ in that Zone*. In the Monthly Plan the route picker is empty for them. **This is a server gap, not a phone bug**: the phone shows what `GET /territory/my-routes` returns, and that list is empty.

**Cause.**
- Onboarding stores the ZSM's Zones/HQs only as a *coverage* (`ManagerCoverage`: `hqIds`, `zoneIds`). Coverage is for who can be picked as a manager and for which holidays apply; it assigns no route.
- The route picker (`/territory/my-routes`, and the plan's own-route check in rule 14) reads **route assignments** only (`ListRoutesForUserUseCase`). The wizard assigns routes only from the `routeIds` it is given, and requires them only for an MR, so a ZSM, and an ASM or RSM, get none.
- Result: coverage says "all HQs of the Zone" but no route is assigned, so the picker has nothing, and a plan with any route is refused (`400` on `entries.N.routeIds`).

**Fixed on the server (2026-10-23), for every designation.** The routes a person covers: in each HQ they cover, the routes assigned to them there; **if none is assigned in that HQ, every active route of it**. A covered Zone with none of its HQs named counts as all its HQs. So a ZSM with a Zone and no HQ gets all routes of the Zone, and an MR, ASM or RSM with an HQ and no route chosen gets all routes of the HQ. This one list feeds `/territory/my-routes`, `GET /planning/monthly/:id/routes`, the plan's own-route check (rule 14) and doctor/chemist access.

**What the phone does.** Nothing to change: the same calls now return the routes. Do not work routes out from the Zone/HQ on the phone. After a refresh, a ZSM's route picker is filled.

## 5. Work With ✅

A day (planned or on a call) can name colleagues to work with.

`GET /identity/work-with` — FIELD only.

| Query | Returns |
|---|---|
| *(none)* / `scope=managers` | **Every active manager in the organisation** — anyone who has direct reports, not only the caller's own chain. |
| `scope=all` | Every active field employee. |

Each row: `{ id, employeeCode, name, designation, label }`. `label` is ready to print: **`Asha Rao (ASM)`**; with no designation it is just the name. The caller is never in the list. Sorted by name.

Suggested phone behaviour:
- Cache both lists on the phone and refresh them with every background sync, so the picker works offline.
- Open the picker on **Managers**, with a switch to **All employees** and a search box (name or code).
- Print `label` on chips and summaries.
- Send only the ids as `workWith: string[]` (≤ 20 a day).

The web plan and call previews show each person with their designation, like `Ravi (MR), Asha (ASM)`. The designation is the person's **current** one; a later promotion changes how an old day reads. (Keeping it as it was on the day would need a snapshot on every plan day and call — not done.)
