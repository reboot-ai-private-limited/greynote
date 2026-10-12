# HLD 9: Financial Year Toggle

How switching to a previous financial year (PRD §6.2 D, "a time machine... to view old reports or pending items") actually behaves.

## 1. FY boundary is configurable, not hardcoded

The financial year start month is a `SystemConfig` value (`FY_START_MONTH`, default `APRIL`) rather than a hardcoded constant — same treatment as every other tunable in this system. A given FY's date range is computed from that config value plus the selected year (e.g. FY2026 = `2026-04-01` through `2027-03-31` with the default).

## 2. Strictly read-only, no exceptions — including stale pending items

This was the key decision: **everything visible under a past-FY view is read-only, full stop — even a record still sitting in `SUBMITTED` status that was never approved or rejected in its own time.** A manager cannot approve/reject a leftover pending item from a past FY through this view.

**Why:** TA/DA depends on the `DCR` being approved (HLD 6), and once a month's `PayrollRun` has been generated — and especially once `FINALIZED` (HLD 7) — that payroll number is a locked snapshot. If a manager could reach back and approve a stale `DCR` from a closed period, it would introduce `Expense` rows that were never part of the already-finalized payroll calculation, silently making a "final" number wrong after the fact. Making the whole toggle strictly read-only avoids this exact failure mode, rather than trying to special-case "is this period's payroll already finalized" into the approval check.

A stuck `SUBMITTED` item from a past FY isn't handled by this toggle at all — it needs a separate resolution path (e.g. Admin support to correct it before payroll runs), which is out of scope for this topic.

## 2a. Payroll note (2026-09-30)

The reason above rests on a finalized payroll being a locked snapshot. Since payroll now counts an expense in the month
it was *paid* (decision-log 2026-09-30), a stale approval no longer changes a finalized sheet — the late expense is paid
later and lands in the next run. The strictly read-only rule is kept anyway: it is what the PRD describes ("view old
reports or pending items"), it is simpler to enforce and to test, and resolving a stuck item is a separate Admin path.

## 2b. How it is selected (2026-09-30)

A per-request header, `X-Financial-Year: <start year>` (FY2025 = 2025-04-01 … 2026-03-31 with the default April start,
named by the year it starts in, the same as the leave year). It is stateless, like the access token: nothing is stored on
the server, and "switching back" is not sending it. No header, or the current FY, behaves exactly as before. A future FY
is a `400`.

- **Mutations.** Any request other than `GET`/`HEAD`/`OPTIONS` that carries a past-FY header is a `409
  FINANCIAL_YEAR_READ_ONLY`. Only `login`, `refresh` and `logout` stay open, so a token refresh mid-view works. The
  phone's background sync simply does not send the header.
- **Reads.** A request for dates outside the selected FY is a `400 OUTSIDE_FINANCIAL_YEAR` (never silently trimmed); dates
  left out default to the FY's range, so a bare list call returns exactly that year.
- **Scope.** The lists that return dated business records: DCRs (`/field-activity/dcr`, `/dcr/team`), Expenses
  (`/field-activity/expenses`), Daily and Monthly Plans (`/planning/daily`, `/monthly`), Leaves (`/hr/leaves`,
  `/leaves/me`), Orders (`/sales/orders`), Payroll runs (`/payroll`), the Approval lists (`/approvals/inbox`, `/team`,
  `/mine` — by `submittedAt`, the "pending items") and Leave Balances (`/hr/leave-balances/*`, by year). Timeless data
  (products, chemists, campaigns, holidays) and month reports outside the six (targets, monthly stock) are untouched;
  a record opened by id is not re-checked (an id only comes from a scoped list).
- **Leave balances** create their rows on first view; a past-FY view must create nothing, so balances for a year before
  the current one are shown as they are, never seeded.

## 3. What it actually does technically

- Sets a date-range filter (that FY's boundaries) across read queries for `DCR`, `DailyPlan`/`MonthlyPlan`, `Expense`, `Leave`, `Order`, and `PayrollRun` for the current user's view.
- Disables every mutation endpoint while a past FY is selected — not just hidden in the UI, but rejected server-side too, since a client can't be trusted to enforce this on its own (same principle as HLD 1/6: never trust the client for something this consequential).
- Switching back to the current FY restores normal read/write behavior with no special handling — there's no "un-toggle" migration step, since nothing was ever mutated while viewing history.

## Next

This is HLD topic 9 — the last of the originally planned topics. See `README.md` for the index. Still pending: the Admin TA/DA override mechanism (follow-up to this conversation) — will land as an amendment to HLD 6 once confirmed.


## Closing a year (2026-10-06)

The toggle above only makes a *viewed* past year read-only. Closing is the other half: an Admin closes an ended year
(`POST /api/config/financial-year/close`), after which payroll generate/finalize and expense payments for that year's months are refused
(`assertFinancialYearOpen`, `shared/time/financialYearClose.ts`, 409 `FY_CLOSED`) whatever the toggle says. Reopening undoes it. The year is
named by the year it starts in and stored in `FY_CLOSED_YEARS`. Why explicit, not automatic on a date: the March salary run (1 April) and the March
expense payout (15 April) belong to the old year, so the Admin closes it after the last payout.

### A closed year and daily work (2026-10-12)

`assertFinancialYearOpen` now also guards the daily-work writes, by the date of the record: the daily-report gate (every call, follow-up and expense record, and the submit), plan deadlines (daily and monthly submit), placing an order, and leave (request, edit, approve). Closing needs the year to have ended, so the day being worked is never in a closed year; the guard refuses late, back-dated and past-month records. `GET /config/public` returns `closedFinancialYears` (start years) so the phone can show the read-only notice.
