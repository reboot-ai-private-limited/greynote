# HLD 10: Submission Gating & Compliance Block

Two related rules that keep a field employee's daily workflow honest: you can't log field activity for a day whose Tour Plan isn't approved, and you can't keep skipping DCR submission without consequence.

## 1. DailyPlan-approval gate

An MR cannot create `DoctorCall`, `ChemistCall`, `DoctorFollowup`, `ChemistFollowup`, or `Expense` (ERD Module 4) for a given date until that date's `DailyPlan` (ERD Module 5) is past the manager's stage: its
`DAILY_PLAN` approval request is `MANAGER_APPROVED` or `APPROVED` (HLD 05). "Approved" below
means exactly that, and it's Planning's contract (`isDailyPlanApproved`) that answers it — not
a status comparison in Field Activity or the app.

```mermaid
sequenceDiagram
    participant MR
    participant App as Mobile App
    participant Cache as Local Cache (DailyPlan status)
    participant API

    MR->>App: Open Dr Call / Chemist Call / Followup / Expense
    App->>Cache: Read today's DailyPlan.status
    alt not approved (no plan, DRAFT, SUBMITTED, REJECTED, WITHDRAWN, REOPENED)
        App-->>MR: Screen disabled, "Today's Tour Plan isn't approved yet"
    else MANAGER_APPROVED or APPROVED
        App-->>MR: Screen usable, MR logs the activity (DRAFT, offline-capable)
        Note over MR,App: ...later, at Submit/sync...
        App->>API: Push record
        API->>API: Re-check DailyPlan.status server-side for that user+date
        API-->>App: Rejects if the DailyPlan isn't actually approved (cache was stale)
    end
```

The client-side check is a UX gate against the locally-synced `DailyPlan` status (reference data, HLD 1 §1.1). The server re-checks at sync time — same reasoning as the `DoctorAssignment` re-validation in HLD 1 §1.4: the device's cached status can be stale (e.g. the manager rejected it after the last sync), so the server's answer is authoritative and the record is rejected/flagged if it disagrees.

This is why `DailyPlan` Submit itself requires a live connection (HLD 1 §1.2, ERD Module 5) — the MR needs a synchronous "approved / not yet" answer before the rest of the day's logging unlocks, not an eventually-consistent one from a queued submission.

## 2. Missed-DCR compliance block

A daily job (server-side, runs after the day rolls over — exact trigger time is an LLD/ops concern, not a schema one) scans active `FIELD`-role users:

```mermaid
sequenceDiagram
    participant Job as Daily Compliance Job
    participant Config as SystemConfig
    participant FA as Field Activity module
    participant HR as HR Ops module (Leave)
    participant ID as Identity module

    Job->>Config: DCR_MISS_BLOCK_ENABLED?
    alt disabled
        Job->>Job: skip
    else enabled
        loop each active FIELD user
            Job->>FA: DCR with status IN (SUBMITTED, MANAGER_APPROVED) for yesterday?
            Job->>HR: APPROVED Leave covering yesterday?
            alt neither found
                Job->>ID: create ComplianceBlock{reason: DCR_MISSED_NO_LEAVE, blocked_at: now}, set User.is_blocked=true
            end
        end
    end
```

`DCR_MISS_GRACE_DAYS` (ERD Module 5, default `1`) is the number of consecutive missed days tolerated before the block fires — the job only blocks once a user has exceeded that count with no covering Leave.

**While `is_blocked = true`:**

- `DailyPlan`/`MonthlyPlan` Submit — rejected.
- `DCR` Final Submission — rejected.
- Creating any DCR child — rejected (same use-case-level check as the DailyPlan-approval gate above, just keyed off `is_blocked` instead of `DailyPlan.status`).

**Still available while blocked:** requesting `Leave` and viewing historical reports — the block only stops _new_, forward-looking submissions, so the MR can still retroactively explain the gap (e.g. file the missing Leave request) rather than being locked out of every screen.

**Clearing the block** is for Admin or any manager above the employee in the reporting chain (changed 2026-10-12; it used to be Admin-only). A reason is required and is kept on the block row with who cleared it and in what role, so every unblock is auditable. The blocked employee, HR and managers outside the chain cannot.

## Next

This is HLD topic 10. See `README.md` for the index.
