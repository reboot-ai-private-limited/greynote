# Roadmap

Phases are ordered by **dependency, not feature count** — mostly the tier graph
`apps/api/.dependency-cruiser.cjs` already enforces (`MODULE_TIERS`, explained in
[`hld/03-system-architecture.md`](hld/03-system-architecture.md) §3), with four cross-cutting
mechanisms from the HLD folded in at the point their first consumer needs them: Auth (tier 1's
own concern), the Approval Workflow Engine, Offline Sync & Geofencing, and Submission Gating —
none of these are ERD modules or tiers of their own; each is shared logic a specific phase below
must land before the module that needs it.

## Phase 0 — Foundations

- Monorepo scaffold (pnpm + Turborepo, `apps/api`, `packages/config`, `packages/contracts`) — **done**
- Bootstrap infra: graceful shutdown, global error handling, response envelope, structured
  logging, `dependency-cruiser` tiers — **done**
- `health` module — the reference implementation every business module copies — **done**
- `Config` module (Tier 0): the `SystemConfig` key-value store backing every Admin-editable cutoff
  and limit in PRD §2 (submission deadlines, device limits, geofence radius) — **done**, internal
  `get(key)` contract only, no HTTP surface yet (deferred to the Phase 9 web portal)

**Done when:** `pnpm dev` gives a working API with a seeded `SystemConfig` collection, `GET
/api/health` returns `200`, and `pnpm check` is green.

## Phase 1 — Identity & Auth

[`LLD/identity.md`](LLD/identity.md) · [`hld/04-authentication-and-sessions.md`](hld/04-authentication-and-sessions.md)

- `User`, `Role`, `Designation`, `PayBand` (ERD Module 1) — **done**
- Login: token model (access + refresh), `UserSession` per device — **done**
- FIELD device approval: every new phone needs Admin approval, max 2 (registered + pending),
  logout doesn't free a slot, rejected phones blocked for a configurable TTL (client sign-off A) —
  **done**
- Admin device actions (approve, reject, remove, log out one phone) and Admin-only password
  reset — **done**
- Admin/HR/Accountant have no device limit — **done**

**Status (2026-09-24): done, and matches the client's answers to sign-off group A**
([`client-sign-off.md`](client-sign-off.md)). Unit tests cover login (every device case),
refresh, logout, logout-all, every Admin device action, password reset and the auth middleware.
Live runs against the dev API passed 32/32 checks for every role's login and sessions, and 32/32
for the device-approval and password-reset flows.

Everything past this phase needs a logged-in, role-known user, so it goes first and alone —
there is no module to parallelize it against yet.

**Done when:** every role can log in and refresh a session, a 3rd concurrent FIELD-role device
login is rejected with the documented prompt (not silently evicting device 1), and the JWT/
session design in `hld/04` has full test coverage.

## Sign-off gate — client business rules

[`client-sign-off.md`](client-sign-off.md)

Not a build phase. The client's `RULES BY GREYNOTE.docx` is still a questionnaire, and its §31
lists the rules that "cannot be changed casually after development" — most unanswered. Send
`client-sign-off.md` now and collect answers **before** the phase each group feeds:

| Group | Blocks |
|---|---|
| A. Login & devices | Answered 2026-09-24 and built into Phase 1 |
| D. Territory, TA & DA | D5, D7 answered 2026-09-24 (Phase 2); the rest block Phase 6 (TA/DA engine) |
| B, C, F | Phase 4 (Planning, Field Master Data, HR). B1, B3, B4 accepted 2026-09-28 — Planning can start; C (Field Master Data) and F (HR) still open |
| E | Phase 6 (Sales & Orders) |

Phase 2 can start in parallel: Zone → HQ → Area → Route is confirmed by the client's Master spec.
A row the client doesn't answer can still be built, but only with its "Today" assumption
accepted explicitly, and recorded in `decision-log.md`.

## Phase 2 — Territory

[`LLD/territory.md`](LLD/territory.md) · [`hld/02-route-distance-calculation.md`](hld/02-route-distance-calculation.md)

- `Zone → HQ → Area → Route` spatial hierarchy (ERD Module 2), with `Area.type` feeding DA
- Route-distance external API integration — auto-recalculated on every waypoint edit, with a
  manual Admin override that itself doesn't survive the next edit (`hld/02` §3)
- `RouteAssignment` (MR ↔ Route, many-to-many)

**Status (2026-09-24): done.** Steps 1–2 done — Zone / HQ / Area CRUD; Routes with
waypoints, Google place search and road distance (Routes API), manual override, recalculate and
revision-checked writes. Live-checked against real Google (Matigara → Medical More → Fulbari:
10.67 km; reversed order 12.34 km). Step 3 done — Route assignments (history kept), `my-routes`
for field employees, and `TerritoryPublicContract` (`getRoute`, `listRoutesForUser`,
`getRoutePath`). Step 4 done — CSV import of Zone / HQ / Area with dry run. Unit tests cover
the hierarchy rules, route distance/override/revision rules, assignments, the contract reads and
the CSV reader/import; live runs against the dev API (real Google key) passed every check.

Tier 2, and the only thing tier 3 as a whole depends on besides Identity. Building it alone
(rather than starting tier 3 in parallel) keeps the external-API integration — the one genuinely
risky piece here — isolated and testable before three modules build assignment/location features
on top of it. Route↔Doctor/Chemist territory coverage is **not** this module's join — the ERD
defers it to Field Master Data (Phase 4), since `Doctor`/`Chemist` don't exist at this tier.

**Done when:** editing a Route's waypoints recalculates `distance_km` from the external API, a
manual override is possible and is correctly cleared by the next waypoint edit, a route whose
distance API call fails still saves master data (flagged `FAILED`, not blocking, retryable), and
Admin can assign MRs to Routes.

## Phase 3 — Approval Workflow Engine

[`hld/05-approval-workflow-engine.md`](hld/05-approval-workflow-engine.md)

An `approval` module in tier 2 (beside Territory; decision-log 2026-09-24 — originally planned
as a shared library) implementing PRD §7.1 / client §19's flow once: Employee → Nearest Higher
Manager → Admin (HR or Admin for Leave), with read-only visibility for managers further up.
Built before its first real consumer because Planning, HR, Field Master Data, Field Activity and
Marketing all need the identical state machine — writing it five times is how the copies drift.

1. Identity: `getDirectReports` / `getDownline` — **done** (2026-09-24)
2. `ApprovalRequest` + history, the state machine, approver resolution, Admin override — **done**
3. Per-kind workflow config (`MANAGER_THEN_FINAL` / `MANAGER_ONLY`), withdraw, resubmit, reopen,
   decision callbacks to the owning module — **done**
4. HTTP: my approvals (manager), Admin/HR queue, team (read-only), approve / reject (bulk),
   withdraw, reopen, request detail with history — **done**
5. Tests, live run, HLD 05 rewrite — **done**

**Status (2026-09-24): done.** Unit tests cover every stage rule, override, top-of-chain, HR on
Leave, live manager changes, withdraw / resubmit / reopen, the transactional callback (including
rollback), every list and bulk decisions; live runs against the dev database (real Mongo
transactions, real HTTP) passed every check. Design: `hld/05`, `LLD/approval.md`.

**Done when:** for a test kind registered only in tests, a request moves `SUBMITTED →
MANAGER_APPROVED → APPROVED` (or `REJECTED` at either stage) with the right actor at each stage;
the approver follows the submitter's *current* manager; top-of-chain goes straight to the final
stage; Admin can act at any stage; managers above the approver see it read-only; withdraw,
resubmit and reopen work with history kept; `MANAGER_ONLY` config ends at the manager; and the
owning module's callback fires on each decision — with no knowledge of which module is calling.

## Phase 4 — Field Master Data, Planning, HR

[`LLD/field-master-data.md`](LLD/field-master-data.md) ·
[`LLD/planning.md`](LLD/planning.md) ·
[`LLD/hr.md`](LLD/hr.md)

Tier 3 — same tier, so these three are **parallelizable across developers** once Identity and
Territory exist. Each depends only on tiers 0–2 and, where noted, the Phase 3 approval engine.

- **Field Master Data** (ERD Module 3): Doctor, Chemist, Distributor, Product, Sample/Gift
  allocation, `DoctorAssignment` (direct MR↔Doctor, independent of route coverage)
- **Planning** (ERD Module 5): Daily/Monthly Tour Plan, submitted through the approval engine
- **HR** (ERD Module 7): Leave Master (grade-wise default allocation), Leave requests — approved
  Employee → Manager → HR or Admin through the Phase 3 approval module (client §11.2; decision-log
  2026-09-24); Holiday Calendar (National/Zone/HQ scoping)

Planning, step by step:

1. Late submissions decided: refused, with a one-off exception (sign-off B8) — **done** (2026-09-28)
2. Business-time helpers, `BUSINESS_TIMEZONE` and the exception keys, Identity `isBlocked` — **done**
3. Daily Plan: save, submit, read, `isDailyPlanApproved` — **done**
4. Monthly Plan — **done**
5. Late-submission exceptions: grant, revoke, list, used by the submit — **done**
6. Live run against the dev database — not yet

Still open for Planning: in-day changes to an approved Daily Plan (client §2.6, likely a
`DAILY_PLAN_CHANGE` kind).

**Done when:** Admin can populate Doctors/Chemists/Distributors/Products and assign MRs to them;
an MR can submit a Daily/Monthly Plan and see it move through Nearest-Manager approval; HR can
configure per-Pay-Band leave defaults and an employee's balance reflects them.

## Phase 5 — Offline Sync & Geofencing

[`hld/01-sync-and-geofencing.md`](hld/01-sync-and-geofencing.md)

The other shared mechanism, and the riskiest mobile-side piece — built once, alone, before Field
Activity becomes the first module to actually depend on it. Two things, both cross-cutting:

- The offline-first local queue: data cached locally, submissions queued until the user hits
  Submit with connectivity (PRD §2)
- GPS-radius validation of a Doctor/Chemist Call against the registered location captured on the
  master record (PRD §5.1)

**Done when:** a Dr Call / Chemist Call logged offline queues correctly and syncs on
reconnection without duplication, and a call logged outside the configured radius is flagged
per `hld/01`'s spec — both against real Field Master Data from Phase 4, not fixtures.

## Phase 6 — Field Activity, Sales & Orders, Marketing

[`LLD/field-activity.md`](LLD/field-activity.md) ·
[`LLD/sales-and-orders.md`](LLD/sales-and-orders.md) ·
[`LLD/marketing.md`](LLD/marketing.md) ·
[`hld/06-ta-da-auto-calculation.md`](hld/06-ta-da-auto-calculation.md) ·
[`hld/10-submission-gating-and-compliance-block.md`](hld/10-submission-gating-and-compliance-block.md)

Tier 4 — same tier, parallelizable the same way Phase 4 was, and the largest phase: this is
where the two shared mechanisms from Phases 3 and 5 get their real consumers.

- **Field Activity** (ERD Module 4): Dr/Chemist Calls & Followups, Expenses, Doctor Service
  (approval-engine-routed), Doctor Gift (Admin-issued, no approval) — TA/DA auto-calculation
  (`hld/06`, Route distance × Pay Band rate) and the submission-gating rules (`hld/10`: no DCR
  entries until today's Plan is Manager-Approved) both land alongside this module, since both are
  specifically about what this module gates and computes
- **Sales & Orders** (ERD Module 6): Stockist/Distributor/Chemist Orders, Monthly Opening/Closing
  Stock — no approval workflow (PRD §5.3.1)
- **Marketing** (ERD Module 8): Visuals/Campaigns, Targets (including the downline-sum rollup —
  `hld/08-target-rollup.md`)

**Done when:** a full DCR day — Plan approved → Dr Call logged with location check → Expense
logged → TA/DA computed → Final Submission — works end to end for a seeded MR and their manager
chain; an MR cannot log field activity for a day whose Plan isn't approved; Orders and stock
counts save independently of any approval; a manager's rolled-up Target equals their direct sum
plus their downline's.

## Phase 7 — Payroll

[`LLD/payroll.md`](LLD/payroll.md) · [`hld/07-payroll-generation.md`](hld/07-payroll-generation.md)

Tier 5, the top of the graph — depends on Identity (Pay Band), HR (unpaid-leave deduction) and
Field Activity (paid TA/DA), so it cannot start earlier no matter how it's staffed.

- `PayrollRun`: Accountant-generated, Draft → Finalized, per field employee per month
- `base_salary` snapshotted from `PayBand` at generation time, not re-read later
- Once Finalized, a month is locked — later expense/leave edits don't retroactively change it

**Done when:** a Finalized PayrollRun's `net_payable` matches `base_salary + total_ta_da −
leave_deduction` for every fixture, and editing an already-paid Expense after finalization
provably does not change the finalized sheet.

## Phase 8 — Financial Year Toggle

[`hld/09-financial-year-toggle.md`](hld/09-financial-year-toggle.md)

The cross-cutting "time machine" (PRD §6.2.D) that lets a user view a previous FY's reports and
pending items. Deliberately last among the backend phases — it needs real historical data
spanning multiple modules to be worth building and testing against; building it earlier means
testing it against fixtures that don't resemble what it will actually render.

**Done when:** switching FY context correctly scopes every report/list screen it touches (per
`hld/09`) without leaking current-FY data into the historical view or vice versa.

## Phase 9 — Web Portal (`apps/web`, Next.js)

Admin/HR/Accountant screens. Starts once there is something to configure — Territory (Phase 2)
and Field Master Data (Phase 4) — and in practice overlaps Phases 4 through 7 rather than
following them strictly: master-data screens can be built the moment their API lands, while
Payroll's screen waits on Phase 7's API regardless of when the web app itself starts.

- Territory & master-data management (Zone/HQ/Route, Doctor/Chemist/Distributor/Product, Sample/
  Gift allocation)
- Approval queues (Plan, Service) and read-only downline visibility
- HR screens (employee lifecycle, leave, holidays)
- Accountant screens (expense audit + mark-paid, Payroll generation)
- Reports (DCR, TP, Gift & Sales)

**Done when:** an Admin/HR/Accountant can perform every Web Portal responsibility in PRD §5
without engineering help, end to end against the real API.

## Phase 10 — Mobile App (`apps/mobile`, React Native + SQLite)

Field-force app. Cannot usefully start before Phase 6 — it is built against a working
Plan→approval→DCR→TA/DA loop, and the offline-sync contract from Phase 5 is exactly what its
local store is built to.

- Auth (employee code + password, device-limit prompt), onboarding
- Home tab: DCR (Daily Plan, Dr/Chemist Call & Followup, Expenses, Summary & Final Submission),
  Marketing (Sales & Orders, Visuals/Campaigns/Targets, Gifts & Services), Resources, Utility
  (Holiday List, Forms, FY Toggle)
- Team tab (conditional, ASM+): approve direct reports, read-only for further downline
- Reports tab
- Full offline-first behaviour per Phase 5's design, including the "no connection at Submit"
  UX for Plan Submit / Final Submission

**Done when:** a full field day is executable with zero connectivity until Final Submission, and
every gated action (Section 7's approval flows, the Plan-approval gate) renders the correct
blocked/pending/approved state rather than a generic error.

## Phase 11 — Pilot

One Zone. A handful of MRs and their manager chain, real devices, real data.

Watch: submission completion rate, time from Plan-submit to Manager-approval, offline-sync
failure rate, geofence false-positive rate (a real call flagged as out-of-radius). Fix what
breaks. **Do not add features during the pilot** — its job is to tell you what's wrong with what
you have, the same discipline driverzone's own roadmap holds to for its pilot phase.

---

## Sequencing rules

1. **Shared mechanisms before their consumers, not alongside them.** The Approval Workflow
   Engine (Phase 3) and Offline Sync & Geofencing (Phase 5) are each built once, in their own
   phase, specifically so Planning/Field Activity/Marketing don't each grow a slightly different
   copy under deadline pressure.
2. **Same-tier modules are parallelizable across developers.** Phase 4 (Field Master Data,
   Planning, HR) and Phase 6 (Field Activity, Sales & Orders, Marketing) are each one phase
   containing three independent modules — split them across engineers rather than serializing.
3. **The web portal can't precede the master data it configures.** Territory and Field Master
   Data screens are worthless without Phases 2 and 4's APIs behind them; Payroll's screen is
   worthless without Phase 7's.
4. **The mobile app can't precede a working approval loop.** Building the field-force UI against
   a Plan→DCR→approval flow that doesn't work yet means rebuilding the UI once it does.
5. **Payroll last among backend phases**, because it is the aggregation of Identity, HR and Field
   Activity — there is nothing for it to compute until those three exist.
6. **Client rules before the code that depends on them.** A phase doesn't start while a
   `client-sign-off.md` row it depends on is unanswered, unless the "Today" assumption is
   explicitly accepted. Phase 1 was built from the PRD before the client's rules were read, and
   may need rework because of it.
7. **Pilot small.** One Zone, a real manager chain, real money in the TA/DA sense even if not a
   payment gateway. Every assumption in the PRD/ERD/HLD meets reality there.
