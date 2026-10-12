# Mobile — Daily Plan

What the field app must do for the Daily Plan, and the rules the server enforces. The server is the authority: the phone's cached status is a UX gate only and may be stale. Companion to [`monthlyplan.md`](monthlyplan.md). Design background: [`LLD/planning.md`](../LLD/planning.md), [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md) (2026-10-12).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against. **Changed 2026-10-12:** the phone must stop calling `POST /planning/daily`, `POST /planning/daily/:id/changes`, `GET /planning/daily/:id/changes` and `GET /planning/changes/:id` — all four are gone (404).

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | A Daily Plan comes **from the approved Monthly Plan**: working type, routes, work-with and remarks are **read-only** to the employee. There is no save endpoint for them. A date the Monthly Plan did not cover has no plan (and so no work that day). | ✅ |
| 2 | The employee's only edit is **the day's doctors** (`POST /planning/daily/doctors`), while the plan is a draft, rejected, withdrawn or reopened. Missed calls still owed from earlier days are added by the server and can't be dropped. | ✅ |
| 2a | **Doctors come only from the day's routes.** A doctor can be picked only if they are **assigned to this employee** and sit on **one of the routes the Monthly Plan gave that day**; any other id is refused with `400` on `doctorIds` (`publicDetails.doctorIds` lists them). The picker should offer only those doctors. The one exception is a missed call carried over from an earlier day: it stays on the list even if that day's routes differ. | ✅ |
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
| `source` | `MONTHLY` for every normal day; the day's fields are shown, not editable |
| `doctors` | the day's list; each with `carriedFrom` (a missed call carried over) |
| `amendments` | a manager's changes to the day, with reason |

- Past `submitDeadline` with neither window set: **"The deadline has passed. Ask Admin for a late-submission exception."** and disable Submit (still call the server — the phone's clock may be wrong).
- No plan for the date: **"There is no plan for this day. Ask your manager."**
- Approved plan: show it read-only, with **"Need a change? Ask your manager."** — no request button.
- Blocked (`403` on submit, `userBlocked` on logging): **"You're blocked for a missed daily report. Ask your manager or Admin to unblock you."**
- The doctor picker lists only the employee's assigned doctors on the day's routes (rule 2a).
- Remove the form for working type, routes, work-with and remarks from the Daily Plan screen; keep only the doctor picker (see [`monthlyplan.md`](monthlyplan.md) §5 for the work-with list, which now applies to the Monthly Plan only).

## 4. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/planning/daily?from&to` | Own plans in a date range (≤ 93 days), with the state fields above. |
| `GET` | `/planning/daily/:id` | One plan (owner, their managers read-only, Admin). |
| `POST` | `/planning/daily/doctors` | `{ planDate, doctorIds[≤50] }` — set the day's doctors; carried-over doctors are added. |
| `GET` | `/planning/daily/carry-over?date=` | Doctors owed from earlier days. |
| `POST` | `/planning/daily/:id/submit` | Submit; online only. |
| `PATCH` | `/planning/daily/:id/amend` | Manager/Admin only: `{ …the whole day, reason }`. |
| `GET` | `/planning/late-grants` | Own late-submission exceptions (`status`, `expiresAt`). |
| `POST` | `/identity/users/:id/unblock` | Admin, or a manager above the employee: `{ reason }` (required). |

Removed 2026-10-12: `POST /planning/daily`, `POST /planning/daily/:id/changes`, `GET /planning/daily/:id/changes`, `GET /planning/changes/:id`, and the `DAILY_PLAN_CHANGE` approval kind and `DAILY_PLAN_CHANGE_MAX` setting (drop it from the phone's cached config).

Errors the screens must handle: `PLAN_SUBMIT_LATE` (409, `publicDetails.deadline`), `MONTHLY_PLAN_NOT_APPROVED` (409), `planNotApproved`, `userBlocked`, `dcrLocked`, "already waiting / already approved" (409), "plan changed while it was being submitted — reload" (409), blocked (403), `PLAN_DAY_REPORTED` (409, on amend), validation errors with `field`.
