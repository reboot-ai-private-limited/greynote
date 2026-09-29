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
  day past that month's end means its last day).
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
- **Lifetime:** expires `LATE_PLAN_GRANT_VALID_HOURS` after it's granted (seeded `24`). It's used
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
| `POST` | `/planning/daily/:id/changes` | FIELD (owner) | Ask to change today's approved plan — to the manager, with a reason |
| `GET` | `/planning/daily/:id/changes` | FIELD (owner, managers), ADMIN | A plan's in-day changes with their approval status |
| `GET` | `/planning/monthly` | FIELD | List own Monthly Plans (month range) |
| `GET` | `/planning/monthly/:id` | FIELD, manager (read-only), Admin | Fetch one |
| `POST` | `/planning/late-grants` | ADMIN; FIELD manager while `LATE_PLAN_GRANT_BY_MANAGER` is on | Grant a late-submission exception |
| `GET` | `/planning/late-grants` | ADMIN (all), FIELD (own and downline) | List exceptions, newest first |
| `POST` | `/planning/late-grants/:id/revoke` | ADMIN, the grantor | Revoke an unused exception |
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
