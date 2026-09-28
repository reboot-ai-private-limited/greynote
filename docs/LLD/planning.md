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
- **`MonthlyPlanEntry`** — a child row of `MonthlyPlan`. Freely editable while the parent is
  `DRAFT`; the whole month submits together as one unit, not entry by entry.

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
  (default `10:00`) and `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` (default the 28th). The PRD does not
  yet specify what happens to a Plan submitted after its cutoff — allowed-but-flagged vs.
  rejected outright is unresolved; treat as an open question to close before this module's
  `submitDailyPlan`/`submitMonthlyPlan` use cases are implemented, not something to silently
  decide in code.

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
  **Open for Phase 4:** client §2.6 wants in-day changes to an approved Plan approved by the
  *manager*, but only Admin can reopen an approved request. Likely answer: a separate
  `DAILY_PLAN_CHANGE` kind (the change is its own approvable record, manager-approved); decide
  when Planning is built.
- Planning reads a Plan's status with `getForRecord`; its `onStatusChange` handles anything that
  must happen on a decision, in the same transaction.
- Approve/reject, the team view, Admin's org-wide queue and history are the approval module's
  `/api/approvals/*` endpoints — Planning has none of its own.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/planning/daily` | FIELD | Save (draft) or update a Daily Plan |
| `POST` | `/planning/daily/:id/submit` | FIELD | Submit — requires connectivity, moves `DRAFT → SUBMITTED` |
| `GET` | `/planning/daily` | FIELD | List own Daily Plans (date range) |
| `GET` | `/planning/daily/:id` | FIELD, manager (read-only per visibility rules) | Fetch one |
| `POST` | `/planning/monthly` | FIELD | Save/update a Monthly Plan and its entries |
| `POST` | `/planning/monthly/:id/submit` | FIELD | Submit the whole month |
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
  Daily/Monthly Plan at all. This module doesn't own the block state (Field Activity/`hld/10`
  does) but its submit use cases must check it before accepting a submission.
- **Nearest manager can't act** (deactivated, on leave, forgot, unreachable) — no per-reason
  detection; Admin approves or rejects from the approval inbox at any time (HLD 05 §4). Same
  rule for every reason.

## Dependencies

- **Identity** (Tier 1): submitter identity and role.
- **Territory** (Tier 2): `route_ids` reference Territory's `Route` entities — Planning validates
  a referenced route exists and is one the submitter is assigned to, via Territory's contract.
- **Config** (Tier 0): submit-cutoff values.
- **Approval** (Tier 2, [`approval.md`](approval.md)): the whole approve/reject workflow,
  approver resolution and team visibility.

## Deliberately deferred

- **Plan-vs-actual adherence reporting** (comparing a `DailyPlan`'s planned routes against the
  DCR calls actually logged that day) — explicitly deferred in `erd/05`; would need a nullable FK
  from `DailyPlan` to `MonthlyPlanEntry` if the two are ever linked, which they currently are not.
- **Post-cutoff submission handling** — flagged above as unresolved; do not invent a behavior for
  this in code before it's decided and recorded in `../decision-log.md`.
