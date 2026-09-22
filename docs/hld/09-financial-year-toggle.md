# HLD 9: Financial Year Toggle

How switching to a previous financial year (PRD §6.2 D, "a time machine... to view old reports or pending items") actually behaves.

## 1. FY boundary is configurable, not hardcoded

The financial year start month is a `SystemConfig` value (`FY_START_MONTH`, default `APRIL`) rather than a hardcoded constant — same treatment as every other tunable in this system. A given FY's date range is computed from that config value plus the selected year (e.g. FY2026 = `2026-04-01` through `2027-03-31` with the default).

## 2. Strictly read-only, no exceptions — including stale pending items

This was the key decision: **everything visible under a past-FY view is read-only, full stop — even a record still sitting in `SUBMITTED` status that was never approved or rejected in its own time.** A manager cannot approve/reject a leftover pending item from a past FY through this view.

**Why:** TA/DA depends on the `DCR` being approved (HLD 6), and once a month's `PayrollRun` has been generated — and especially once `FINALIZED` (HLD 7) — that payroll number is a locked snapshot. If a manager could reach back and approve a stale `DCR` from a closed period, it would introduce `Expense` rows that were never part of the already-finalized payroll calculation, silently making a "final" number wrong after the fact. Making the whole toggle strictly read-only avoids this exact failure mode, rather than trying to special-case "is this period's payroll already finalized" into the approval check.

A stuck `SUBMITTED` item from a past FY isn't handled by this toggle at all — it needs a separate resolution path (e.g. Admin support to correct it before payroll runs), which is out of scope for this topic.

## 3. What it actually does technically

- Sets a date-range filter (that FY's boundaries) across read queries for `DCR`, `DailyPlan`/`MonthlyPlan`, `Expense`, `Leave`, `Order`, and `PayrollRun` for the current user's view.
- Disables every mutation endpoint while a past FY is selected — not just hidden in the UI, but rejected server-side too, since a client can't be trusted to enforce this on its own (same principle as HLD 1/6: never trust the client for something this consequential).
- Switching back to the current FY restores normal read/write behavior with no special handling — there's no "un-toggle" migration step, since nothing was ever mutated while viewing history.

## Next

This is HLD topic 9 — the last of the originally planned topics. See `README.md` for the index. Still pending: the Admin TA/DA override mechanism (follow-up to this conversation) — will land as an amendment to HLD 6 once confirmed.
