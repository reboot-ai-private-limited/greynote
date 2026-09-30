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
| B, C, F | Phase 4 (Planning, Field Master Data, HR). B1, B3, B4 accepted 2026-09-28 — Planning done; F3, F11–F16 accepted 2026-09-28 — HR done; C3, C4, C6, C7, C8 accepted 2026-09-29 — Field Master Data done |
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
6. Live run against the dev database — **done** (2026-09-28)
7. In-day changes to an approved Daily Plan (client §2.6) — **done** (2026-09-29); live-checked, 36 checks

**Status (2026-09-28): Planning done.** 36 unit tests (deadline edges in IST, every-submit
lateness, manager switch and team scope, expiry, revoke, the DCR gate) plus a live run on the dev
database: 41 checks over real HTTP, real Mongo transactions and indexes. It included a rollback
where an edit races a late submit and the exception survives. Temporary data was removed
afterwards.

In-day changes to an approved Daily Plan (client §2.6) are built as their own manager-approved
`DAILY_PLAN_CHANGE` request (`LLD/planning.md`); the rules are working assumptions, sign-off B9.

HR, step by step:

1. Design recorded: LLD rewrite, employee HQ, lazy balances, pending ledger — **done** (2026-09-28)
2. Leave-year helpers and Config keys, Identity `getEmploymentDetails`, Territory `UserHqAssignment` — **done**
3. HR skeleton, Leave Types, Leave Master — **done**
4. Holidays — **done**
5. Balances — **done**
6. Leave requests through the approval module, and the public contract — **done**
7. Live run against the dev database — **done** (2026-09-29)

**Status (2026-09-29): HR done.** A live run on the dev database: 90 checks over real HTTP, real Mongo
transactions and indexes, with the real Approval routers. It covered leave types and the Leave
Master, holidays scoped to National / HQ / other HQ, lazy and pro-rata balances, counted days
(weekly off and the employee's own holidays skipped), every refusal (overlap, overdraw, backdating,
leave-year boundary, half-day, no Pay Band), the whole approval ledger (submit, manager, final,
reject, edit, withdraw, Admin reopen and re-approve), unpaid days through the contract, HR balance
adjustments, and a rollback where a broken ledger step undoes the final approval. Temporary data
was removed afterwards.

The run showed the ledger's `consume` / `release` / `give back` didn't check that the row covered the
days, so a drifted row went negative. Fixed (2026-09-29): each is now a conditional update, and a
missing or drifted row throws (`LEAVE_BALANCE_MISSING` / `LEAVE_BALANCE_DRIFT`), rolling the decision
back. Checked live: normal moves pass, a repeat on an empty row throws.

Field Master Data, step by step (decision-log 2026-09-29):

1. Config keys (`DOCTOR_VISIBILITY_FOLLOWS_ROUTE`, `AUTO_ASSIGN_DOCTOR_ON_APPROVAL`,
   `NEW_DOCTOR_COVERAGE_WAIT_DAYS`); Territory's `listRoutesForUser` already gives an MR's current
   Routes, so it needs no new method — **done** (2026-09-29)
2. Module skeleton, Products, Chemists — **done** (2026-09-29)
3. Doctors: Admin create with a map point, assignments with the Route rule, visibility — **done** (2026-09-29; live-checked, 45 checks)
4. MR add-Doctor: `NEW_DOCTOR` approval, offline-safe create, auto-assign on approval — **done** (2026-09-29; live-checked, 38 checks)
5. Distributors and sample allocations — **done** (2026-09-29; live-checked, 48 checks). Territory's contract gained `listRouteIdsInScope`
6. Tests, live run against the dev database — **done** (2026-09-29): one end-to-end run over the whole module, 41 checks

**Status (2026-09-29): Phase 4 done** — Planning, HR and Field Master Data are built and live-checked.
Field Master Data: 11 + 14 + 17 + 13 unit tests across the steps, a live run per step and a final
end-to-end run (41 checks: catalog, an MR adding a Doctor offline, approval with Admin's map
correction, auto-assign, samples with racing gives, route-loss visibility and the switch,
rejection and reopen, deactivation rules). Still open from this phase, none blocking Phase 5: the client's Doctor Service
types (C8, needed in Phase 6), and the client's confirmation of the in-day change rules (B9).

**Done when:** Admin can populate Doctors/Chemists/Distributors/Products and assign MRs to them;
an MR can submit a Daily/Monthly Plan and see it move through Nearest-Manager approval; HR can
configure per-Pay-Band leave defaults and an employee's balance reflects them.

## Phase 5 — Offline Sync & Geofencing

[`LLD/sync.md`](LLD/sync.md) · [`hld/01-sync-and-geofencing.md`](hld/01-sync-and-geofencing.md)

The other shared mechanism, and the riskiest mobile-side piece — built once, alone, before Field
Activity becomes the first module to actually depend on it. This phase is the **server half** (the
phone's local store is Phase 10). Offline data is **committed once, at the daily report's Submit**
(sign-off G1), with a private draft backup underneath so a lost phone doesn't lose the day (G9) and
the phone taking the server's version at Submit (G10); Plans, Leave and approvals need a live
connection at the action.

1. Design recorded, sign-off G1–G10 accepted, money decided as integer paise — **done** (2026-09-29)
2. Geofence: the distance check, `PASS` / `FAIL` / `UNVERIFIED`, radius and accuracy from SystemConfig — **done** (2026-09-29): a pure function in `shared/geo`, 10 tests; Field Activity calls it in Phase 6
3. Money migration: `PayBand` and `Route.taPerKmRateOverride` from `Decimal128` to integer paise
   (before Phase 6 adds Expenses) — **done** (2026-09-29): helpers and rounding in `shared/money`,
   a one-off idempotent script run on the dev database, live-checked over HTTP
4. Sync module (tier 2): receipts, the handler registry, `POST /sync/push` (Submit) with per-record
   results, dependency order, the creation-time rules — **done** (2026-09-29): 28 tests, and a
   29-check live run (real transactions, 8 simultaneous sends of one record, real rollback, 2 MB body
   limit); a big day is sent in chunks of 100
5. Draft backup (G9, G10): `PUT` / `GET /sync/drafts` — opaque, private, last write wins, removals
   remembered, size and count limits, TTL purge, drafts cleared with the receipt at Submit — **done**
   (2026-09-29): 19 tests and a 32-check live run (the atomic last-write-wins upsert under 12
   simultaneous out-of-order uploads, the TTL and unique indexes, the draft delete rolling back with
   a failed record)
6. `NEW_DOCTOR` through it (the one real offline record that exists today) — **done** (2026-09-29):
   the first handler registered into the engine, 8 tests and a 28-check live run through the real
   app (push, retry, 8 simultaneous sends, route drift, the direct endpoint first, approval after)
7. Pull: the source registry and `GET /sync/pull`, with Field Master Data, Territory, HR, Planning
   and Config as sources — **done** (2026-09-29): 21 tests and a 29-check live run (exactly the
   caller's data, stable versions, only the changed source returned, Doctors vanishing and returning
   with a Route to exactly the earlier version)
8. Contract types in `packages/contracts`, a sync-client simulator test (dropped connections, replayed
   batches, a lost phone restored on another), and one end-to-end live run — **done** (2026-09-29):
   the API is built against the shared types (a conformance test pins it), a phone simulator with 46
   tests including 30 random-connection days, and a 23-check live run over a flaky connection

**Status (2026-09-29): Phase 5 done** — the server half of offline sync and geofencing, in eight
steps: design and decisions, the geofence check, money as integer paise, the push engine, the private
draft backup, `NEW_DOCTOR` through it, the pull, and the shared contract with a phone simulator.
About 150 new tests (314 before the phase, 470 after) and a live run per step, ending in one over a flaky connection: a lost phone is
restored on another, a Submit in chunks with replies lost is applied once per record, a Route change
makes Doctors vanish and return to exactly the earlier version, and calls are flagged `PASS` / `FAIL` /
`UNVERIFIED` against locations that came through the real pull. What remains is the phone itself
(Phase 10) and the record kinds Phase 6 registers.

**Done when:** an MR-added Doctor sent in a push is created exactly once however many times the push
is repeated or interrupted, a record whose parent failed is reported as such without losing the
rest, drafts backed up from one phone restore on another and a stale copy never overwrites a newer
one, no other endpoint can read a draft, the pull returns exactly the caller's data (and a Route
change makes Doctors appear and vanish), and a call-shaped test record is flagged `FAIL` / `UNVERIFIED`
correctly — all against real Field Master Data from Phase 4, not fixtures. Real calls, expenses and
orders join in Phase 6.

## Phase 6 — Field Activity, Sales & Orders, Marketing

[`LLD/field-activity.md`](LLD/field-activity.md) ·
[`LLD/sales-and-orders.md`](LLD/sales-and-orders.md) ·
[`LLD/marketing.md`](LLD/marketing.md) ·
[`hld/06-ta-da-auto-calculation.md`](hld/06-ta-da-auto-calculation.md) ·
[`hld/10-submission-gating-and-compliance-block.md`](hld/10-submission-gating-and-compliance-block.md)

Field Activity and Sales & Orders are Tier 4, and Marketing is Tier 5 beside Payroll (it reads Sales'
order totals; decision-log 2026-09-29) — so Marketing is built after Sales. The largest phase: this is
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

Field Activity, step by step (decision-log 2026-09-29):

1. Decisions recorded; Identity `blockUser`; the module skeleton — **done** (2026-09-29)
2. The DCR and the gate: one DCR per user per date, its approval in the approval module, and one check for
   "may this MR log anything for this date?" (Plan approved, not blocked) — **done** (2026-09-29): 26 tests
   and a 26-check live run (the gate's five refusals against a real approved Plan, `DCR_SUBMIT` through the
   push, Identity `blockUser` under 6 simultaneous calls, rejection and resubmit)
3. Calls, follow-ups and samples given: the server-side geofence, the Doctor still assigned, atomic sample
   draw-down — **done** (2026-09-29): 527 tests and a 21-check live run (geofence PASS/FAIL/UNVERIFIED echoed
   and replayed, 8 simultaneous sample draws → exactly the stock, rollback of a half-met sample list,
   assignment drift, radius changed in System Config taking effect on the next call)
4. Expenses (manual), every record kind registered into the sync push, and the DCR submit that depends on
   them all — **done** (2026-09-29): the `EXPENSE` kind; 531 tests and a 13-check live run (a day of three
   expenses + the submit sent out of order, replay, decimal/zero/TA/DA refused, 6 simultaneous pushes of one
   expense → one row). Gifts and Services register their kinds in step 7, orders in Sales
5. DCR review: manager approve / reject, the geofence override — **done** (2026-09-29): approve/reject is the
   approval module's; the override endpoint has 8 unit tests and a 15-check live run (who may, at which stage,
   4 simultaneous accepts → one winner, the review screen, Admin after the manager approves)
6. TA/DA auto-generation at the manager's approval, and its cancellation — **done** (2026-09-29): 18 new tests
   and a 14-check live run (per-Route TA at the Route's own and the pay band's rate, DA at the day's highest Area
   type, a flagged zero for an uncalculated Route, Admin's final rejection cancels, resubmit and re-approve write
   fresh rows once, a later Route change leaves the approved row alone). Planning gained `getDailyPlanDay`
7. Doctor Service (approval) and Doctor Gift (Admin allocates, MR marks done) — **done** (2026-09-29): the
   `DOCTOR_SERVICE` and `GIFT_DONE` kinds and four REST endpoints; 14 new tests and a 25-check live run (a Service
   through manager and Admin approval, Admin-made ones tied to the assigned MR, 5 simultaneous "done" → one wins,
   a Doctor reassigned mid-offline hands its gift to the new MR, a blocked MR refused). Field Master Data gained
   `getAssignedUserId`
8. The Accountant's mark-paid, and the contract (`getPaidTaDaTotal`, `hasQualifyingDcr`, `getDcrSummary`) —
   **done** (2026-09-29): the audit list and idempotent mark-paid (an `accepted` flag on each expense, kept in step
   by the DCR approval hook); 8 new tests and a 16-check live run (unpayable until accepted, 5 simultaneous
   payments → one payer, a paid row surviving Admin's rejection, Payroll's total counting only PAID TA/DA)
9. The missed-DCR compliance script — **done** (2026-09-29): `compliance:run` with `--dry-run` / `--user`, 12 unit
   tests and an 11-check live run of the real script (dry run, disabled switch, real block, second run blocks no
   one, Admin's clearing gives a clean slate). Payroll's total also gained `reimbursementPaise`. Identity gained
   `listActiveFieldUserIds` / `getLastBlockClearedAt`, HR `listOffDates`
10. A `fieldActivity` pull source and the shared contract types — **done** (2026-09-29): `FieldActivitySnapshot` in
    `packages/contracts`; 7 unit tests and a 13-check live pull (empty, `unchanged`, a service/gift/day appearing,
    determinism, another MR sees nothing, a service approved, a gift done, a block appearing, all six sources)
11. Live run: a full day end to end — **done** (2026-09-29): one 24-check run through real HTTP — Plan gate, nine
    records pushed out of order and retried, the server's geofence PASS/FAIL/UNVERIFIED, samples 10 → 7, the
    manager's review and override, TA 6170 + DA 20000 computed and paid, Payroll's total, the phone's pull, and the
    compliance job blocking a MR who never reported. **Field Activity is complete.**

Sales & Orders, step by step (decision-log 2026-09-30) — Monthly Stock first, Orders after:

1. Decisions recorded (E1 → last day of the month; miss = report, not block); the `sales` module skeleton —
   docs **done** (2026-09-30)
2. Monthly Stock: opening/closing per Product for Chemists and Distributors, the deadline rule, Admin unlock,
   `canActOnChemist` — **built** (2026-09-30): 19 unit tests (the deadline across 28/29/30/31-day months, grace
   days and the IST midnight edge; access, overwrite, closed/unlocked/future months, who sees what) and a 47-check live
   run through real HTTP on a throwaway Atlas database (an MR's own Chemist and Distributor, overwrite and replay,
   another MR's outlet 403, closed/future months 409, Admin's correction and unlock, 6 simultaneous entries → one row,
   the DB's own refusal of both/neither outlet and of a duplicate key, who sees what, the missing-stock report, and a
   `MONTHLY_STOCK` push with a refused, a closed-month and a malformed record beside a good one, then replayed)
3. The `MONTHLY_STOCK` sync kind — **built**, unit-tested through the use case; a `salesStock` pull source is not
4. The missing-stock report (`GET /sales/monthly-stock/missing`) and the read-only `stock-check:run` job — **built**
5. Orders (`PLACED → DONE/CANCELLED`), the `ORDER` sync kind, and a live run — **done** (2026-09-30): 9 unit tests
   and a 53-check live run through real HTTP on a throwaway Atlas database (server-computed amounts, 13 refusals,
   the DB's own refusal of both/neither outlet, a wrong total and no lines, who sees and who may finish, 8 simultaneous
   complete/cancel → exactly one winner, and the `ORDER` push with a refused, a malformed and a good record, replayed).
   **Sales & Orders is complete.**

Marketing, step by step (decision-log 2026-09-30) — **done** (2026-09-30): Visuals (real Cloudinary upload),
Campaigns and Targets with the downline rollup. 14 unit tests (+1 in Sales for `sumOrderAmount`) and a 59-check live
run through real HTTP on a throwaway Atlas database: the upload fetched back from Cloudinary, a corrupt PDF, an
executable and an oversize file refused, active-only for field staff, Targets replaced not duplicated, 6 simultaneous
first-time sets → one row, own + downline rolled up against real orders (cancelled and last month's left out, by
product, by campaign dates), who may set and who may read, and the rollup following a change of manager.

**Phase 6 is complete** — Field Activity, Sales & Orders and Marketing are built and live-checked.

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

Payroll, step by step (decision-log 2026-09-30):

1. Decisions recorded (paid-month basis, Accountant + Admin, ended months only, no proration but flagged) — docs
   **done** (2026-09-30)
2. Field Activity's `getPaidTaDaTotal` counts by the month an expense was paid — **done** (2026-09-30): +2 tests (paid
   in the next month; the IST midnight edge, and December wrapping the year)
3. The Payroll module: generate (bulk, per-user outcomes), finalize, read — **done** (2026-09-30): 28 unit tests
   (the calculation at every rounding boundary, generate/finalize/access, `proratePaise` in `shared/money`)
4. Live run, including the "Done when" below — **done** (2026-09-30): 41 checks through real HTTP on a throwaway Atlas
   database with real Field Activity expenses (paid, unpaid, cancelled, paid the month before) and real HR leave
   (approved unpaid days incl. a half-day, a pending one, a paid-type one, another month's): exact sums and a
   half-up deduction on 4,500,050 (75,000.83 → 75,001); no Pay Band skipped without failing the batch; joiner
   flagged not prorated; 6 simultaneous bulk generates → one row per employee; 6 simultaneous finalizes → one winner;
   generate racing finalize → ends FINALIZED; and **the lock**: after finalizing, a raised Pay Band, new leave and an
   expense paid through the real Accountant endpoint leave the finalized sheet byte-for-byte unchanged, regenerating
   is a 409 (one employee) or a skip (batch), and the late payment appears in the paid month only.
   **Payroll is complete; the backend phases are done. Financial Year Toggle (Phase 8) is next.**

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
