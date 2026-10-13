# Mobile — Monthly Plan and Work With

What the field app must do for the Monthly Plan, and the rules the server enforces (the Daily Plan is in [`dailyplan.md`](dailyplan.md)). The server is the authority: the phone's cached status is a UX gate only and may be stale. Design background: [`LLD/planning.md`](../LLD/planning.md), [`decision-log.md`](../decision-log.md).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the Tour Plan with day entries, out-station trips (`returnDate`, stay and transit days), deadline and resubmit and late windows, rejection reason, and Work With from `/identity/work-with`.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | One Monthly Plan per employee per month: up to 31 day entries, each with a working type (`FIELD_WORK`, `DOCTOR_CAMPAIGN`, `MEETING`, `CONFERENCE`, `STRIKE`), routes, work-with people and remarks. Field work and doctor campaign need routes; the others have none. | ✅ |
| 2 | **Deadline** for month *M* = the end of the business day of `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` (default the 28th) **of the month before**. | ✅ |
| 3 | The business day follows the **global day start** (`DAY_START_TIME`, e.g. `02:00`) in `BUSINESS_TIMEZONE`. With `02:00`, the 28th ends at **01:59:59.999 on the 29th**, not at midnight. Never compute this on the phone — show `submitDeadline` from the server. | ✅ |
| 4 | Save is free while the plan is a draft, and works **offline**. **Submit needs a live connection** (it is never queued). | ✅ |
| 5 | The month goes to the manager as **one unit** (no per-day status). The manager approves, then Admin is the final approver. | ✅ |
| 6 | A submitted or approved plan is **frozen**. Editable again only after a rejection, a withdrawal, or an Admin reopen. | ✅ |
| 7 | After the deadline, submit is refused with `409 PLAN_SUBMIT_LATE` unless one of: (a) the after-rejection resubmit window is open, (b) Admin granted a late-submission exception. | ✅ |
| 8 | **Resubmit window** after a rejection: `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` (default 24 h), at most `PLAN_RESUBMIT_GRACE_MAX` times (default 2), and **never after the month has started**. | ✅ |
| 9 | **Late-submission exception**: Admin can allow one employee to submit one plan after its deadline, once. A manager can too, for their team, only while `LATE_PLAN_GRANT_BY_MANAGER` is on. Used up by the submit. | ✅ |
| 10 | The exception ends at an **exact date and time Admin picks** (`expiresAt`, an ISO date-time), in the future and within `LATE_PLAN_GRANT_MAX_HOURS` (default 744 h) of now, else 400 on `expiresAt`. Without one it lasts `LATE_PLAN_GRANT_VALID_HOURS` (24 h) from the grant. Admin grants it on the web (**Late submissions**). | ✅ |
| 11 | When the month is approved, each entry from **today onward** becomes that day's Daily Plan (`source: MONTHLY`, a draft). The employee **cannot edit** it, but still **submits it each day** and the manager still approves it. | ✅ |
| 12 | **No approved Monthly Plan = no work that month.** Daily plans for the month can't be saved or submitted, and nothing can be logged. Refused with `MONTHLY_PLAN_NOT_APPROVED` (REST `409` on saving or submitting a daily plan, `publicDetails.planMonth`; a sync record or DCR submit is refused with the same code). The month of a day is its business date's month. A new joiner or anyone who missed the deadline asks Admin for a late-submission exception. Applies to every month, including the current one. | ✅ |
| 13 | A blocked employee (missed reports) cannot submit; the server says so. | ✅ |
| 14 | Every route must be one of the employee's own active routes; every work-with person must be an active employee; nobody lists themselves or a person twice. | ✅ |
| 15 | **The routes chosen here decide the day's doctors.** The Daily Plan inherits each day's routes; the employee can then pick doctors only if they are **assigned to them and on that day's routes** (otherwise `400` on `doctorIds`). A missed call carried over from an earlier day is the one exception. So choose the routes carefully: a doctor on a route not planned for the day can't be added. See [`dailyplan.md`](dailyplan.md) rule 2a. | ✅ |
| 16 | **Out-station trip.** On the day the employee leaves, an entry may carry `returnDate` (after `planDate`, this month or the next, field work or doctor campaign, with at least one out-station route). The server writes the days in between as `dayKind: STAY` and the return day as `dayKind: TRANSIT`, copying the trip's routes, work-with and remarks. Leave `returnDate` empty for a same-day return: that is an ordinary day. Send the entries back as they were read (stay/transit days included) or without them; the server rebuilds them from the trip. A trip can't run over another planned day and can't return later than the month after. **A trip that crosses a month end** also writes its stay/transit days into the next month's plan (made as a draft if it has none); that month still needs its own submit and approval by its own deadline. Saving is refused (`400`) if one of those days is already planned there, and (`409`) if the next month's plan is waiting or approved. Cutting the trip short removes the days again. A `returnDate` on a trip with no out-station route is refused at submit (`400` on that day's `routeIds`). | ✅ |
| 17 | **What the days earn** (once each day's report is approved): trip day = TA + out-station DA; stay day = out-station DA, no TA; transit day = TA + **ex-station** DA. Each stay and transit day is a normal working day: it needs its own approved Daily Plan (inherited) and a submitted DCR, and calls may be made on it. The phone shows them as locked trip days; to change a trip, edit the first day. | ✅ |

## 2. Statuses

`DRAFT` → `SUBMITTED` → `MANAGER_APPROVED` → `APPROVED`. Also `REJECTED`, `WITHDRAWN`, `REOPENED` (the last three are editable and can be resubmitted). Treat `MANAGER_APPROVED` and `APPROVED` both as "approved" for the user's purposes; the server's gate counts both.

## 3. What the phone should show

From `GET /planning/monthly?from=YYYY-MM&to=YYYY-MM` (each row):

| Field | Use |
|---|---|
| `status` | badge; whether Edit / Submit / Withdraw are offered |
| `submitDeadline` | "Submit by …" in the business timezone (rule 3) |
| `resubmitAllowedUntil` | non-null: "You can still resubmit until …" |
| `lateSubmitAllowedUntil` | non-null: "Admin allowed a late submission until …" |
| `approval` | who/when it was submitted and decided |

- Past `submitDeadline` with neither window set: show **"The deadline has passed. Ask Admin for a late-submission exception."** and disable Submit. (Still call the server — the phone's clock may be wrong.)
- On `PLAN_SUBMIT_LATE` show the same message with `publicDetails.deadline`.
- A rejected plan shows the rejection reason (from the approval request) and a Resubmit button while `resubmitAllowedUntil` is set.
- With no approved plan for the month, the Daily Plan and call screens show **"Your monthly plan for <month> isn't approved yet."** and a link to the Monthly Plan screen.

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/planning/monthly` | Save the whole month (draft). Body `{ planMonth: "YYYY-MM", entries: [{ planDate, workingType, routeIds, workWith, remarks, returnDate? }] }` (entries read back also carry `dayKind`: `NORMAL`, `STAY`, `TRANSIT`)`, ≤ 31 entries, each date inside the month, no date twice. |
| `GET` | `/planning/monthly?from&to` | Own plans, ≤ 12 months, with the state fields above. |
| `GET` | `/planning/monthly/:id` | One plan. |
| `POST` | `/planning/monthly/:id/submit` | Submit; online only. |
| `GET` | `/identity/work-with` | Work-with candidates (below). |
| `GET` | `/planning/late-grants` | Own late-submission exceptions (`status`, `expiresAt`) — the same time the plan row's `lateSubmitAllowedUntil` shows. |

Errors the screen must handle: `PLAN_SUBMIT_LATE` (409), `MONTHLY_PLAN_NOT_APPROVED` (409), "already waiting / already approved" (409), "plan changed while it was being submitted — reload" (409), blocked (403), validation errors with `field` (e.g. `entries.3.routeIds`).

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
