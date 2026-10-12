# Planning

The Tour Plan module: a field employee's forward-looking schedule, submitted for their Nearest
Higher Manager's approval before it unlocks anything else that day. Covers `DailyPlan` and
`MonthlyPlan` (ERD Module 5) — PRD §6.2.A ("Daily Plan (Tour Plan)"), §7.2 (TP approval), §7.5
(compliance blocking). Full field list: [`../erd/05-planning-and-rules.md`](../erd/05-planning-and-rules.md).

This module does **not** implement the gate that blocks DCR entries on an unapproved Plan — it
only owns and exposes Plan state. The gate itself is Field Activity's concern
([`field-activity.md`](field-activity.md)), consuming this module's contract. Keeping the gate
out of Planning is deliberate: Planning sits in Tier 3 and cannot see Field Activity (Tier 4)
even if it wanted to enforce anything there.

## What it owns

- **`DailyPlan`** — one row per user per date: `working_type` (`FIELD_WORK`/`MEETING`/
  `CONFERENCE`/`STRIKE`), `work_with` (array of accompanying `user_id`s), `route_ids` (array —
  a day can cover more than one Route), `remarks`. Its approval state (status, who reviewed it,
  history) is **not** stored here — it's the `DAILY_PLAN` `ApprovalRequest` in the `approval`
  module ([`approval.md`](approval.md)); an earlier draft carried `status`/`reviewed_by` fields.
- **`MonthlyPlan`** — the envelope: one row per user per month, carrying only the approval
  fields. Its `MonthlyPlanEntry` children hold the day-by-day detail (same shape as `DailyPlan`:
  `working_type`, `work_with`, `route_ids`, `remarks`, one per planned date).
- **`MonthlyPlanEntry`** — a child of `MonthlyPlan`, embedded in its Mongo document (at most 31,
  always saved and submitted together, so one document keeps each write atomic). Freely editable
  while the parent is `DRAFT`; the whole month submits together as one unit, not entry by entry.
- **`LatePlanSubmitGrant`** — a one-off exception to a submit deadline (see *Late-submission
  exceptions*).
- **`DailyPlanChange`** — a request to change an approved Daily Plan on its own day (see *In-day
  changes to an approved Daily Plan*).

Plan dates are calendar days (`YYYY-MM-DD`, months `YYYY-MM`), stored as strings, not instants.

`DailyPlan` and `MonthlyPlan` are **independent** — no FK between a `DailyPlan` row and a
`MonthlyPlanEntry`, by deliberate ERD choice (no plan-vs-actual adherence feature yet; see
`erd/05`'s design-decisions section for how that would be added later).

`SystemConfig` (the `DAILY_PLAN_SUBMIT_CUTOFF_TIME`, `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` keys this
module reads) is **not** owned here — it lives in the separate Tier-0 `Config` module
(`hld/03-system-architecture.md` §3) and is reached through `Config`'s public contract, the same
way every module reads a tunable value.

## Public contract

`PlanningPublicContract`, in the shape [`module-anatomy.md`](../engineering/module-anatomy.md)
establishes (compare `health.public.ts`'s one-method contract for the pattern, not the content):

```ts
interface PlanningPublicContract {
  /** The DCR gate: may this user log field activity for this date? */
  isDailyPlanApproved(userId: UserId, date: PlanDate): Promise<boolean>;
  getDailyPlanStatus(userId: UserId, date: PlanDate): Promise<PlanApprovalStatus | null>;
  /** The day's working type and routes with its status, for TA/DA at the DCR's approval (Field Activity); null with no Plan. */
  getDailyPlanDay(userId: UserId, date: PlanDate): Promise<{ status: PlanApprovalStatus; workingType: WorkingType; routeIds: string[] } | null>;
  getMonthlyPlanStatus(userId: UserId, month: PlanMonth): Promise<PlanApprovalStatus | null>;
}
```

`isDailyPlanApproved` is the one method that matters most to the rest of the system: it's what
Field Activity's submission gate (`hld/10-submission-gating-and-compliance-block.md`) calls to
decide whether a given user may log a Dr Call, Dr Followup, Chemist Call, Chemist Followup, or
Expense for a given date. **True when the day's `DAILY_PLAN` request is `MANAGER_APPROVED` or
`APPROVED`** — i.e. past the manager's stage (client sign-off B4: "blocked until the day's Plan is
Manager-approved"). Checking `=== 'MANAGER_APPROVED'` alone would be wrong: a top-of-chain
submitter, an Admin override and a `MANAGER_ONLY` workflow all go straight to `APPROVED`, and a
manager-approved Plan moves on to `APPROVED` when Admin signs it off. False for no plan, `DRAFT`,
`SUBMITTED`, `REJECTED`, `WITHDRAWN` and `REOPENED` — "no plan" is never "approved by default."
The rule lives here, once, so Field Activity and the mobile app's cached check don't each
re-derive it. `getDailyPlanStatus` stays for screens that show the status itself.

Kept deliberately narrow: only status, not the full `DailyPlan` document. A future consumer that
needs Route or Work-With detail is a reason to extend the contract, not to reach past it.

## Write-path rules & invariants

- **`DRAFT` is fully offline.** A field employee can create and edit a Daily or Monthly Plan
  with no connectivity — matches the offline-first local queue every mobile-side write uses
  ([`../hld/01-sync-and-geofencing.md`](../hld/01-sync-and-geofencing.md)).
- **`Submit` is the one write on this module that requires a live connection at the moment it's
  tapped** — the sole documented exception to the offline-queue rule (PRD §6.2.A, §7.2;
  `erd/05`'s design-decisions section states it explicitly). Submitting a `DailyPlan` or
  `MonthlyPlan` synchronously calls the server; there is no "queue the submit and sync it later"
  path. This is deliberate, not an oversight: `hld/10`'s gate reads live Plan-approval status, so
  a queued-but-not-yet-server-side submit would let a device believe it's unlocked DCR entry
  before the server agrees.
- **A `MonthlyPlan` submits as one unit.** Individual `MonthlyPlanEntry` rows have no status of
  their own; the month's one `MONTHLY_PLAN` approval request governs all of them. Entries are
  editable while the month is still a `DRAFT` (no request yet) or its request
  `isEditableBySubmitter` (`REJECTED` / `WITHDRAWN` / `REOPENED`) — otherwise the month is frozen.
- **`route_ids` and `work_with` are arrays, not join rows** — a plan can name more than one Route
  or accompanying colleague for a single day, matching the same pattern `DoctorCall.work_with`
  and `Route.waypoints` use elsewhere in the ERD.
- **Submit-time cutoffs are enforced from `Config`, not hardcoded**: `DAILY_PLAN_SUBMIT_CUTOFF_TIME`
  (default `10:00`) and `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` (default the 28th), read in
  `BUSINESS_TIMEZONE` (default `Asia/Kolkata`) on every submit. A Daily Plan is due at the cutoff
  time on its own date. A Monthly Plan is due at the end of the cutoff day in the month before (a
  day past that month's end means its last day), where "end of the day" is one millisecond before the next business day starts
  (`DAY_START_TIME`, default 00:00; see the decision log 2026-10-10).
- **A late submit is refused** (`409 PLAN_SUBMIT_LATE`, details carry `deadline` and `planKey`),
  resubmits included, unless a resubmit window is open or the employee holds a late-submission
  exception (both below). Decided 2026-09-28, sign-off B8.

## Resubmit window after a rejection

After a rejection, the employee may resubmit past the deadline until the later of the deadline and
the rejection time plus a grace period. Limits apply, whichever is reached first:

| | Grace | Hard stop |
|---|---|---|
| Daily Plan | `DAILY_PLAN_RESUBMIT_GRACE_MINUTES` (30) | `DAILY_PLAN_RESUBMIT_LATEST_TIME` (11:30) on the plan's date |
| Monthly Plan | `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` (24) | the start of the plan's month |

Both are limited to `PLAN_RESUBMIT_GRACE_MAX` (2) window resubmits per Plan, counted on the Plan
(`lateResubmits`) in the submit transaction. The window opens only on `REJECTED`, not after the
employee's own withdraw and not after an Admin reopen. A submit inside the window doesn't use a
late-submission exception. Plan views show `resubmitAllowedUntil` while one is open.
- **A blocked user can't submit** (`403`), checked through Identity's `isBlocked` (PRD §7.5,
  `hld/10`).
- **Submit validates against today's state:** every `route_id` must be one of the submitter's
  active Routes (Territory's `listRoutesForUser`), every `work_with` id an active user other than
  the submitter. `FIELD_WORK` needs at least one Route; `MEETING` / `CONFERENCE` / `STRIKE` take
  none.

## Late-submission exceptions

A `LatePlanSubmitGrant` lets one employee submit one Plan (`DAILY_PLAN` + date, or
`MONTHLY_PLAN` + month) after its deadline:

- **Who grants:** Admin, for anyone. A manager, for someone in their downline, only while
  `LATE_PLAN_GRANT_BY_MANAGER` is `true` (seeded `false`). A reason is required.
- **Lifetime:** ends at the `expiresAt` the grantor picks — in the future and within `LATE_PLAN_GRANT_MAX_HOURS` (seeded `744`) of now — or, if none is given, `LATE_PLAN_GRANT_VALID_HOURS` after it's granted (seeded `24`). It's used
  up by the submit it allows, inside the same transaction as `approval.submit`, so a failed
  submit leaves it unused. Admin or the grantor can revoke it while it's unused.
- At most one open (unused, unrevoked) exception per employee and Plan. An expired one doesn't
  count as open.
- It only lifts the deadline. The Plan still goes through normal approval, and a later late
  resubmit of the same Plan needs a new exception.
- A Plan's view carries `submitDeadline` and, while an exception is usable,
  `lateSubmitAllowedUntil`, so the app can say which applies.
- Stored status is `OPEN` / `USED` / `REVOKED` / `EXPIRED`. `EXPIRED` is written lazily (when a new
  exception for the same Plan is granted); reads treat an `OPEN` one past `expiresAt` as expired.

## Approval workflow

Both `DailyPlan` and `MonthlyPlan` go through the `approval` module (built in Phase 3 —
[`approval.md`](approval.md), [`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md));
this doc does not re-derive that state machine. As it applies here:

- Planning registers kinds `DAILY_PLAN` and `MONTHLY_PLAN` (final approver: `ADMIN`) and calls
  `approval.contract.submit` from its own submit endpoints. A Plan is `DRAFT` until then —
  `DRAFT` is Planning's own state, before any `ApprovalRequest` exists.
- Flow: `SUBMITTED → MANAGER_APPROVED → APPROVED` (or `REJECTED` at either stage); the approver
  is the submitter's current manager; top-of-chain and Admin override are final in one step.
  If the client finds Admin approving every Daily Plan too heavy, `DAILY_PLAN` goes into
  `APPROVAL_MANAGER_ONLY_KINDS` and ends at the manager — no code change.
- Once submitted, the employee can't edit a Plan (client §2.5) unless it's `REJECTED`,
  `WITHDRAWN` or Admin-`REOPENED` — Planning's edit endpoints check `isEditableBySubmitter`.
  In-day changes to an approved Plan (client §2.6) are a separate `DAILY_PLAN_CHANGE` kind — see
  the next section.
- Planning reads a Plan's status with `getForRecord`; its `onStatusChange` handles anything that
  must happen on a decision, in the same transaction.
- Approve/reject, the team view, Admin's org-wide queue and history are the approval module's
  `/api/approvals/*` endpoints — Planning has none of its own.

## No approved Monthly Plan, no work (decision-log 2026-10-12)

`SaveDailyPlanUseCase` and `SubmitDailyPlanUseCase` call `assertMonthlyApproved` (`monthlyGate.ts`) first: the owner's Monthly Plan for the day's month must be `MANAGER_APPROVED` or `APPROVED` (`getPlanStatus.isMonthlyPlanApproved`, also on the public contract). Otherwise `409 MONTHLY_PLAN_NOT_APPROVED` with `publicDetails.planMonth`. Field Activity's `LoggingGate` asks the same question through its `PlanningPort` before the daily-plan check and refuses with `GateRefusal` code `MONTHLY_PLAN_NOT_APPROVED`. The way in for a new joiner or a missed deadline is a late-submission exception for that month.

## Daily Plans inherit from the Monthly Plan (decision-log 2026-10-03)

The `MONTHLY_PLAN` kind's `onStatusChange` (`monthlyPlanInheritHandler.ts`) runs in the approval's
transaction once the month is `MANAGER_APPROVED` or `APPROVED`. For every entry from **today on** it creates
that day's `DailyPlan` — `source: MONTHLY`, a draft with no approval request — unless the day already has one.
Safe to repeat: a re-approved month refreshes only inherited days that were never submitted (or came back for
changes) and were never amended; submitted, approved, employee-written (`MANUAL`) and amended days are left alone.

- **Inheriting approves nothing.** The employee **submits every day** (the 10:00 cutoff, late rules and
  exceptions apply unchanged) and the manager approves it; the DCR gate still needs the day approved.
- **The owner can't edit an inherited day:** `POST /planning/daily` for it is `409` with
  `reason: PLAN_INHERITED_READONLY`. They submit it as it is. A day the month didn't cover is written by the owner (`MANUAL`).
- **Amend** — `PATCH /planning/daily/:id/amend` `{ …the whole day, reason }`. Allowed for Admin and for anyone above the
  employee in the chain; never the employee (`403`), never outside the chain (`404`). Validated like a submit (the
  employee's own active routes and colleagues). Appends `{ by, at, reason, previous }` to `amendments` and bumps
  `revision`; the plan's approval is untouched, so an approved day stays approved. Refused (`409`) for a day that is
  over, and once that day's DCR is submitted (`reason: PLAN_DAY_REPORTED`) because TA/DA follows the plan's routes —
  Admin reopens the DCR first. The DCR check is handed back to Planning after both modules are built
  (`bindDayReported`) and fails closed until bound.
- **Doctors and carry-over (decision-log 2026-10-10).** `DailyPlan.doctors` is set by `POST /planning/daily/doctors`
  `{ planDate, doctorIds }` (the owner, any `source`, only while the plan is editable; max 50; doctors must be the
  owner's visible doctors and on the day's routes). `CarryOver.pending(user, date)` returns the doctors first planned on
  an earlier APPROVED day and not called since (`listCalledDoctorIds` from the first-planned day), still the MR's, within
  the window from `CALL_CARRY_OVER_FOREVER` / `CALL_CARRY_OVER_DAYS` (0 = month end); exposed as
  `GET /planning/daily/carry-over?date=`. Those doctors are added to the list on save and on submit and can't be dropped,
  so the whole list is what the manager approves. Field Activity's `ROUTE_NOT_IN_PLAN` check lets a doctor the plan lists
  as carried through (contract `getDailyPlanDay.carriedDoctorIds`). `listPlannedDoctors(user, month)` feeds the
  doctor-visits report (`plannedDays`, `missedSince`). The doctor directory and the called-doctors lookup are handed in
  after the containers are built (`bindDoctorSources`). Amendments and in-day changes do not carry the doctor list.
- The in-day change request below stays as the employee's way to **ask** for a change to today's approved plan.
- Plans approved before this change get their days from the one-off `migrate:inherit-monthly`.

## In-day changes to an approved Daily Plan

Client §2.6: the day's plan can change during the day, and the manager decides. Only Admin can
reopen an approved request, so a change is **its own approvable record**, kind `DAILY_PLAN_CHANGE`,
registered with `managerOnly: true` — the approval module gives it no final stage whatever
`APPROVAL_MANAGER_ONLY_KINDS` says (`approval.md`). Admin can still act on it, and a top-of-chain
employee's change goes to Admin. These are working assumptions (sign-off B9), not client answers.

- **Asking:** `POST /planning/daily/:id/changes` with the whole day as it should now be, plus a
  required reason. Only the plan's owner; only for **today** (the business timezone); only while
  the plan is `MANAGER_APPROVED` or `APPROVED` — the states in which the day's gate is open. A draft
  or rejected plan is edited and submitted, not "changed". A blocked employee can't ask. The
  submit deadlines don't apply, since an in-day change is after them by nature. The proposed day
  goes through the same checks as a submit (own active routes, active colleagues, a valid working
  type) and must differ from the plan.
- **While it waits, the plan doesn't move:** it stays approved with its old content, so the gate
  stays open and the employee keeps working to it. **One waiting change per plan**, enforced by a
  partial unique index, so two simultaneous requests can't both get in.
- **Approving** (the employee's manager; Admin may override) writes the proposed day into the plan,
  bumps its `revision`, and closes the change as applied — in the approval's transaction. The plan's
  own approval is untouched. It is **refused (409)** if the plan is no longer approved (Admin
  reopened it), was changed since the request (`basedOnRevision` no longer matches), or the day is
  over; the manager then rejects it. Nothing changes on a refusal.
- **Rejecting or withdrawing** closes the change and leaves the plan as it was; the employee may
  ask again. A decided change can't be reopened — Admin reopens the plan itself instead.
- **Cap:** at most `DAILY_PLAN_CHANGE_MAX` (seeded `3`) *applied* changes per plan; rejected and
  withdrawn ones don't count.
- **Reading:** `GET /planning/daily/:id/changes` — newest first, each with `previous`, `proposed`,
  `reason`, and its approval status — for the owner, their managers (read-only) and Admin.
  `GET /planning/changes/:id` reads one change by its own id, which is what an approval request's
  `recordId` points at; same readers.
- What happens to field activity already logged against the old plan is Field Activity's call
  (Phase 6), as with any reopen.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/planning/daily` | FIELD | Save (draft) or update a Daily Plan |
| `POST` | `/planning/daily/:id/submit` | FIELD | Submit — requires connectivity, moves `DRAFT → SUBMITTED` |
| `GET` | `/planning/daily` | FIELD | List own Daily Plans (date range) |
| `GET` | `/planning/daily/:id` | FIELD, manager (read-only per visibility rules) | Fetch one |
| `POST` | `/planning/monthly` | FIELD | Save/update a Monthly Plan and its entries |
| `POST` | `/planning/monthly/:id/submit` | FIELD | Submit the whole month |
| `PATCH` | `/planning/daily/:id/amend` | FIELD (owner's managers), ADMIN | Amend an employee's day, with a reason; the old body is kept |
| `POST` | `/planning/daily/:id/changes` | FIELD (owner) | Ask to change today's approved plan — to the manager, with a reason |
| `GET` | `/planning/daily/:id/changes` | FIELD (owner, managers), ADMIN | A plan's in-day changes with their approval status |
| `GET` | `/planning/changes/:id` | FIELD (owner, managers), ADMIN | One change by its own id (an approval request's `recordId`) |
| `GET` | `/planning/monthly` | FIELD | List own Monthly Plans (month range) |
| `GET` | `/planning/monthly/:id` | FIELD, manager (read-only), Admin | Fetch one |
| `POST` | `/planning/late-grants` | ADMIN; FIELD manager while `LATE_PLAN_GRANT_BY_MANAGER` is on | Grant a late-submission exception; optional `expiresAt` (future, within `LATE_PLAN_GRANT_MAX_HOURS`) |
| `GET` | `/planning/late-grants` | ADMIN (all), FIELD (own and downline) | List exceptions, newest first |
| `POST` | `/planning/late-grants/:id/revoke` | ADMIN, the grantor | Revoke an unused exception |
| `GET` | `/identity/work-with` | FIELD | Who can be named in *Work With*: every active manager in the org, or `?scope=all` for every active field employee; each with a `Name (ASM)` label (identity module) |
| — | `/api/approvals/*` | Manager, Admin | Pending queue, team view (actionable vs read-only), approve/reject, Admin's org-wide queue and override — the approval module's endpoints ([`approval.md`](approval.md)), filtered with `kind=DAILY_PLAN` / `MONTHLY_PLAN` |

Exact paths are illustrative — finalize against whatever URL convention the Identity module's
first endpoints establish, and keep Daily/Monthly symmetric.

## Edge cases

- **A `DailyPlan` saved as `DRAFT` but never submitted.** `isDailyPlanApproved` is false for an
  absent Plan and a draft alike — the employee simply cannot log field activity for that date. No
  special-cased "forgot to submit" state.
- **Admin rejects (or later reopens) a Plan the manager already approved.** The gate closes again
  from that moment. What happens to field activity already logged against it that day is Field
  Activity's call, to decide in Phase 6 — Planning only reports the current state.
- **Submit attempted with no connectivity.** Must fail clearly and immediately (not silently
  queue) — the client-side UX needs to distinguish this from every other offline-tolerant write
  in the app, since a user's mental model everywhere else is "it'll sync later."
- **Top-of-chain submitter** (`manager_id IS NULL`): handled by the approval module — Admin
  decides alone, in one step. Planning does nothing special.
- **A rejected Plan.** The employee edits and resubmits; the approval module records it as a new
  cycle on the same request, history kept (HLD 05 §3).
- **Compliance block active** (PRD §7.5): a user blocked for missed DCR cannot submit a new
  Daily/Monthly Plan at all. This module doesn't own the block state (the flag is Identity's
  `User.isBlocked`, set by Field Activity's job in `hld/10`); its submit use cases check Identity's
  `isBlocked` before accepting a submission.
- **Nearest manager can't act** (deactivated, on leave, forgot, unreachable) — no per-reason
  detection; Admin approves or rejects from the approval inbox at any time (HLD 05 §4). Same
  rule for every reason.

## Dependencies

- **Identity** (Tier 1): submitter identity and role, the manager chain, `isBlocked`.
- **Territory** (Tier 2): `route_ids` reference Territory's `Route` entities — Planning validates
  a referenced route exists and is one the submitter is assigned to, via Territory's contract.
- **Config** (Tier 0): submit cutoffs, `BUSINESS_TIMEZONE`, the late-exception keys.
- **Approval** (Tier 2, [`approval.md`](approval.md)): the whole approve/reject workflow,
  approver resolution and team visibility.

## Deliberately deferred

- **Plan-vs-actual adherence reporting** (comparing a `DailyPlan`'s planned routes against the
  DCR calls actually logged that day) — explicitly deferred in `erd/05`; would need a nullable FK
  from `DailyPlan` to `MonthlyPlanEntry` if the two are ever linked, which they currently are not.
- **Editing a waiting or decided in-day change** — a change is immutable once asked; the employee withdraws it and asks again.
- **How far ahead a Daily Plan may be made** — no limit yet.
