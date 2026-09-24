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
  a day can cover more than one Route), `remarks`, and the shared approval fields (`status`,
  `submitted_at`, `reviewed_by`, `reviewed_at`).
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
  getDailyPlanStatus(userId: UserId, date: PlanDate): Promise<PlanApprovalStatus | null>;
  getMonthlyPlanStatus(userId: UserId, month: PlanMonth): Promise<PlanApprovalStatus | null>;
}
```

`getDailyPlanStatus` is the one method that matters most to the rest of the system: it's what
Field Activity's submission gate (`hld/10-submission-gating-and-compliance-block.md`) calls to
decide whether a given user may log a Dr Call, Dr Followup, Chemist Call, Chemist Followup, or
Expense for a given date. Returns `null` when no `DailyPlan` exists yet for that date — the gate
treats "no plan" the same as "not approved," never as "approved by default."

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
- **A `MonthlyPlan` submits as one unit.** Individual `MonthlyPlanEntry` rows have no `status` of
  their own; the parent `MonthlyPlan.status` governs the whole month. Entries are editable only
  while the parent is `DRAFT` — once `SUBMITTED`, the month is frozen pending review.
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

Both `DailyPlan` and `MonthlyPlan` route through the shared Approval helper described in
[`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md) — this doc does
not re-derive that state machine. In short, as it applies here:

- **Approver resolution**: a single-hop lookup, `submitter.manager_id` via Identity's contract —
  never a chain walk. If `manager_id` is `NULL` (top-of-chain, e.g. an NSM), the submission
  routes directly to Admin as the sole approver.
- **Transition**: `DRAFT → SUBMITTED → MANAGER_APPROVED` (forwarded to any Admin automatically,
  by role check, not a hierarchy walk) or `SUBMITTED → REJECTED`.
- **Read-only visibility**: any manager strictly above the Nearest Higher Manager sees the Plan
  and its status via the Team tab, computed live off Identity's `getDownline`, never stored on
  the Plan row itself.
- Planning's use cases **delegate** to this shared helper for the transition and approver logic —
  they own only the `DailyPlan`/`MonthlyPlan` collections and the fields specific to a Plan
  (`working_type`, `route_ids`, etc.), not a second copy of the approve/reject state machine.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/planning/daily` | FIELD | Save (draft) or update a Daily Plan |
| `POST` | `/planning/daily/:id/submit` | FIELD | Submit — requires connectivity, moves `DRAFT → SUBMITTED` |
| `GET` | `/planning/daily` | FIELD | List own Daily Plans (date range) |
| `GET` | `/planning/daily/:id` | FIELD, manager (read-only per visibility rules) | Fetch one |
| `POST` | `/planning/monthly` | FIELD | Save/update a Monthly Plan and its entries |
| `POST` | `/planning/monthly/:id/submit` | FIELD | Submit the whole month |
| `GET` | `/planning/team/pending` | Manager | Plans awaiting this manager's approval (direct reports only) |
| `GET` | `/planning/team` | Manager | Full downline view, split actionable vs. read-only |
| `POST` | `/planning/:id/approve` | Manager (Nearest Higher Manager only) | Approve |
| `POST` | `/planning/:id/reject` | Manager (Nearest Higher Manager only) | Reject |
| `GET` | `/admin/planning` | Admin | All `MANAGER_APPROVED` Plans |
| `GET` | `/admin/approvals/pending` | Admin | All `SUBMITTED` Plans org-wide, filterable by `managerId` and date range (`hld/05` §5) |
| `POST` | `/admin/approvals/:id/approve` | Admin | Approve any `SUBMITTED` Plan directly, independent of the nearest manager (`hld/05` §5) |
| `POST` | `/admin/approvals/:id/reject` | Admin | Reject any `SUBMITTED` Plan directly (`hld/05` §5) |

Exact paths are illustrative — finalize against whatever URL convention the Identity module's
first endpoints establish, and keep Daily/Monthly symmetric.

## Edge cases

- **A `DailyPlan` saved as `DRAFT` but never submitted.** Field Activity's gate treats an absent
  or non-`MANAGER_APPROVED` Plan identically — the employee simply cannot log field activity for
  that date. No special-cased "forgot to submit" state.
- **Submit attempted with no connectivity.** Must fail clearly and immediately (not silently
  queue) — the client-side UX needs to distinguish this from every other offline-tolerant write
  in the app, since a user's mental model everywhere else is "it'll sync later."
- **Top-of-chain submitter** (`manager_id IS NULL`): routes straight to Admin, single stage, per
  `hld/05` §2 — Planning's use case must not attempt a Nearest-Higher-Manager lookup that will
  never resolve.
- **A rejected Plan.** PRD doesn't specify a resubmit path explicitly; the natural read is the
  employee edits and resubmits, moving `REJECTED → SUBMITTED` again — confirm this against
  Field Activity's DCR module, which shares the same question, before diverging between the two.
- **Compliance block active** (PRD §7.5): a user blocked for missed DCR cannot submit a new
  Daily/Monthly Plan at all. This module doesn't own the block state (Field Activity/`hld/10`
  does) but its submit use cases must check it before accepting a submission.
- **Nearest manager can't act** (deactivated, on leave, forgot, unreachable) — no per-reason
  detection; Admin can approve or reject the `SUBMITTED` Plan directly at any time via
  `/admin/approvals/:id/approve`/`reject` (`hld/05` §5). Same rule for every reason, not a
  different path for "manager on leave" vs. "manager deactivated" vs. "manager forgot."

## Dependencies

- **Identity** (Tier 1): submitter identity, role, `manager_id` for approver resolution,
  `getDownline` for Team-tab visibility.
- **Territory** (Tier 2): `route_ids` reference Territory's `Route` entities — Planning validates
  a referenced route exists and is one the submitter is assigned to, via Territory's contract.
- **Config** (Tier 0): submit-cutoff values.
- **Approval Workflow Engine** ([`hld/05`](../hld/05-approval-workflow-engine.md), shared logic,
  not a module): the transition/approver/visibility mechanics.

## Deliberately deferred

- **Plan-vs-actual adherence reporting** (comparing a `DailyPlan`'s planned routes against the
  DCR calls actually logged that day) — explicitly deferred in `erd/05`; would need a nullable FK
  from `DailyPlan` to `MonthlyPlanEntry` if the two are ever linked, which they currently are not.
- **Post-cutoff submission handling** — flagged above as unresolved; do not invent a behavior for
  this in code before it's decided and recorded in `../decision-log.md`.
- **Resubmission flow for a rejected Plan** — same open question as Field Activity's DCR;
  resolve once, for both modules, not independently.
