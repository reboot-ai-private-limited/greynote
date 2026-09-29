# Module 5: Planning (Tour Plans) + Rules

Covers: `DailyPlan`, `MonthlyPlan` (+ `MonthlyPlanEntry`), and `SystemConfig` — the generic rule table referenced by every prior module (PRD §6.2 A, §7.2, glossary "TP").

## Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string name "full User entity defined in Module 1"
    }

    DAILY_PLAN {
        uuid id PK
        uuid user_id FK
        date plan_date
        string working_type "FIELD_WORK, MEETING, CONFERENCE, STRIKE"
        json work_with "array of accompanying user_ids"
        json route_ids "array of Route ids for the day"
        string remarks
        string status "DRAFT, SUBMITTED, MANAGER_APPROVED, REJECTED"
        timestamp submitted_at
        uuid reviewed_by FK "nearest higher manager, nullable until reviewed"
        timestamp reviewed_at
    }
    MONTHLY_PLAN {
        uuid id PK
        uuid user_id FK
        string plan_month "e.g. 2026-10"
        string status "DRAFT, SUBMITTED, MANAGER_APPROVED, REJECTED"
        timestamp submitted_at
        uuid reviewed_by FK "nearest higher manager, nullable until reviewed"
        timestamp reviewed_at
    }
    MONTHLY_PLAN_ENTRY {
        uuid id PK
        uuid monthly_plan_id FK
        date plan_date
        string working_type "FIELD_WORK, MEETING, CONFERENCE, STRIKE"
        json work_with "array of accompanying user_ids"
        json route_ids "array of Route ids for that day"
        string remarks
    }
    LATE_PLAN_SUBMIT_GRANT {
        uuid id PK
        uuid user_id FK "the employee allowed to submit late"
        string kind "DAILY_PLAN, MONTHLY_PLAN, DAILY_PLAN_CHANGE"
        string plan_key "2026-10-05 or 2026-10"
        string reason
        uuid granted_by FK "Admin, or a manager in the user's chain"
        timestamp granted_at
        timestamp expires_at
        timestamp used_at "nullable; set by the submit it allowed"
        timestamp revoked_at "nullable"
    }
    SYSTEM_CONFIG {
        uuid id PK
        string key UQ "e.g. DAILY_PLAN_SUBMIT_CUTOFF_TIME"
        string value "e.g. 10:00"
        string module "tag - PLANNING, AUTH, FIELD_ACTIVITY"
        string description
        uuid updated_by FK
        timestamp updated_at
    }

    USER ||--o{ DAILY_PLAN : "user_id"
    USER ||--o{ DAILY_PLAN : "reviewed_by (manager)"
    USER ||--o{ MONTHLY_PLAN : "user_id"
    USER ||--o{ MONTHLY_PLAN : "reviewed_by (manager)"
    MONTHLY_PLAN ||--o{ MONTHLY_PLAN_ENTRY : "monthly_plan_id"
    USER ||--o{ LATE_PLAN_SUBMIT_GRANT : "user_id / granted_by"
    USER ||--o{ SYSTEM_CONFIG : "updated_by"
```

## Design decisions locked for this module

- **Monthly Plan is day-by-day, same shape as Daily Plan.** `MonthlyPlan` is the envelope (one row per user per month); `MonthlyPlanEntry` holds one row per planned day with the same fields as `DailyPlan` (`working_type`, `work_with`, `route_ids`, `remarks`). Entries can be edited freely while the parent `MonthlyPlan.status = DRAFT`; the whole month is submitted together, and only then does it move into the approval flow.
- **Daily Plan and Monthly Plan are independent — no link between them.** A `DailyPlan` row does **not** reference a `MonthlyPlanEntry`. This was a deliberate choice against building a plan-vs-actual adherence feature now; it can be added later as a nullable FK on `DailyPlan` if that reporting need comes up.
- **Superseded 2026-09-24:** approval state (`status`/`reviewed_by`/`reviewed_at` below) moves to the `approval` module's `ApprovalRequest` (`../LLD/approval.md`); the fields are dropped when Planning is built. Kept below as the record of the earlier model.
- **Same two-stage approval as `DCR` (Module 4).** Both `DailyPlan` and `MonthlyPlan` carry `status`/`reviewed_by`/`reviewed_at`, with `reviewed_by` always the nearest higher manager. Once `status = MANAGER_APPROVED`, Admin visibility is automatic via the `manager_id` hierarchy walk (Module 1) — no separate "sent to admin" field, consistent with how `DCR` handles it.
- **A late Plan is refused; `LATE_PLAN_SUBMIT_GRANT` is the override** (decision-log 2026-09-28, sign-off B8). One row lets one user submit one Plan (`kind` + `plan_key`) after its deadline, once, before `expires_at`. At most one open (unused, unrevoked) row per `user_id` + `kind` + `plan_key`.
- **`MONTHLY_PLAN_ENTRY` is embedded in the `MONTHLY_PLAN` Mongo document**, not a separate collection — at most 31, always saved and submitted together.
- **`route_ids` and `work_with` are JSON arrays**, not join tables — same pattern used for `DoctorCall.work_with` (Module 4) and `Route.waypoints` (Module 2). A plan can cover more than one route or co-worker in a single day.
- **`SystemConfig` is now formalized**, holding every tunable value referenced by earlier modules rather than hardcoding them:
  - `DAILY_PLAN_SUBMIT_CUTOFF_TIME` = `10:00`
  - `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` = `28`
  - `BUSINESS_TIMEZONE` = `Asia/Kolkata` — the timezone every business deadline is read in
  - `LATE_PLAN_GRANT_BY_MANAGER` = `false` — whether a manager (not just Admin) may grant a late-submission exception
  - `LATE_PLAN_GRANT_VALID_HOURS` = `24` — how long a late-submission exception stays usable
  - `DAILY_PLAN_RESUBMIT_GRACE_MINUTES` = `30` — after a rejection, how long a Daily Plan may still be resubmitted past its deadline
  - `DAILY_PLAN_RESUBMIT_LATEST_TIME` = `11:30` — no Daily Plan resubmit window runs past this time on the plan's date
  - `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` = `24` — the same window for a Monthly Plan, never past the month's start
  - `PLAN_RESUBMIT_GRACE_MAX` = `2` — at most this many window resubmits per Plan
  - `DAILY_PLAN_CHANGE_MAX` = `3` — at most this many in-day changes applied to one approved Daily Plan
  - `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` = `true` (Module 3) — an MR sees only the assigned Doctors on their current Routes; off, they keep every assigned Doctor across a Route change
  - `AUTO_ASSIGN_DOCTOR_ON_APPROVAL` = `true` (Module 3) — approving an MR-added Doctor assigns it to that MR
  - `NEW_DOCTOR_COVERAGE_WAIT_DAYS` = `8` (Module 3) — days after approval before a new Doctor counts toward coverage
  - `MAX_REGISTERED_DEVICES_FIELD` = `2` (Module 1) — approved + pending phones per field employee
  - `REJECTED_DEVICE_TTL_DAYS` = `7` (Module 1) — how long a phone Admin rejected stays blocked
  - `GEO_FENCE_RADIUS_METERS` = `200` (Module 4; the client's document says 100 — Admin changes it, sign-off C5)
  - `GEO_MAX_ACCURACY_METERS` = `100` — a GPS reading less accurate than this makes a call's geofence `UNVERIFIED`
  - `SYNC_MAX_BATCH` = `500`, `SYNC_MAX_AGE_DAYS` = `7`, `SYNC_CLOCK_SKEW_MINUTES` = `10` — the daily-report push's limits (`LLD/sync.md`)
  - `DCR_MISS_BLOCK_ENABLED` = `true` (Module 1/4, HLD 10) — kill switch for the missed-DCR compliance block
  - `DCR_MISS_GRACE_DAYS` = `1` (Module 1/4, HLD 10) — how many consecutive days without a submitted DCR (and without an approved Leave covering them) before the block triggers
  - `SystemConfig` values are Admin-writable at runtime, not just seed defaults — a `PATCH` per key, ADMIN-only, so e.g. `DCR_MISS_GRACE_DAYS` can be moved from its default `1` to `2` or `3` without a redeploy (decision-log 2026-09-24)
- **`Submit` on `DailyPlan`/`MonthlyPlan` requires a live connection at tap time — unlike other transactional records (HLD 1 §1.1), it does not queue offline.** Saving as `DRAFT` still works fully offline for UX; only the state transition into the approval flow needs a synchronous server round-trip, since it's what the DailyPlan-approval gate (HLD 10) depends on. Same carve-out applies to `DCR` Final Submission (Module 4).

### DailyPlanChange (in-day change to an approved Daily Plan)

`plan_id`, `user_id`, `plan_date`, `previous` and `proposed` (a planned day each: `working_type`,
`work_with`, `route_ids`, `remarks`), `reason`, `based_on_revision`, `open`, `applied`, `created_at`.
Its approval state is the `DAILY_PLAN_CHANGE` `ApprovalRequest` (`record_id` = this id), manager-only.
At most one row per plan has `open = true` (partial unique index). `applied` is set when an approval
writes `proposed` into the plan and bumps its `revision`. See `LLD/planning.md`.

## Next

**Module 6 — Sales & Orders.** `Order` (standalone, attaching to either `Distributor` or `Chemist` — not linked to `ChemistCall`, per Module 4's decision) and Chemist/Distributor Monthly Opening/Closing stock.
