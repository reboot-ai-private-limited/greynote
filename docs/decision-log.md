# Decision Log

Decisions that have been **made**, newest first, with what they replaced and what they cost.

Three files cover decisions and they do not overlap:

| File | Answers |
|---|---|
| [`erd/`](erd/README.md) / [`hld/`](hld/README.md) | **The design as written** — schema and mechanism, in the present tense |
| [`engineering/tech-choices.md`](engineering/tech-choices.md) | **Current state**: what we use and why |
| this file | **History**: when it changed, what it replaced, what was rejected |

When something here supersedes an ERD/HLD doc or `tech-choices.md`, that doc gets rewritten to
describe the new present and this log keeps the record of the change. This log is append-only —
entries are never edited to match a later reversal; a reversal is a new entry that references the
old one.

---

## 2026-09-28 — Approvals are decided on a cycle; bulk isolates faults; date filters carry an offset

**Decision:** Three fixes from the Phase 3 review, before Planning becomes the first consumer:

- **A decision names the cycle it was made on.** `POST /approvals/:id/approve|reject` require
  `cycle`; `POST /approvals/bulk` takes `requests: [{ id, cycle }]` instead of `requestIds`. The
  conditional write matches status **and** cycle. Replaces the status-only guard.
- **Bulk never fails as a whole.** An unexpected error on one item (an unregistered kind, an
  owning module's `onStatusChange` throwing a plain `Error`) is logged at `error` and returned as
  that item's `500`; the other items still run. Previously it aborted the loop with a bare `500`
  after earlier items had already committed.
- **List `from` / `to` must be ISO date-times with an offset**, both inclusive. A bare date is a
  `400`. Replaces `z.coerce.date()`, which read `to=2026-09-28` as 00:00 UTC — dropping that day,
  and off by 5½ hours for IST.

**Why:** Withdraw + resubmit returns a request to `SUBMITTED` on a new cycle with a possibly
edited record, so a status-only guard let a manager approve content they never saw. The server
has no business timezone, so it cannot turn a bare date into a day; the client can.

**Consequences:** web and mobile clients send the `cycle` from the row they displayed, and send
local start/end-of-day instants. A business-timezone `SystemConfig` key is still needed for
Planning's 10:00 Daily Plan deadline (B3) — added in Phase 4, not here. No client existed yet,
so the contract change cost nothing.

**Refs:** `apps/api/src/modules/approval/`, `docs/LLD/approval.md`, `docs/hld/05-approval-workflow-engine.md` §8

---

## 2026-09-24 — Approval workflow switch is one list key; decision callbacks are transactional

**Decision:** Two refinements while building Phase 3 step 3:

- **One config key, not one per kind.** `APPROVAL_MANAGER_ONLY_KINDS` (seeded `NONE`) lists the
  kinds that end at the manager; every other kind is Manager → final. The planned per-kind
  setting (and a per-kind `defaultWorkflow` on registration) is dropped. Read at each
  (re)submission and snapshotted onto the request, so a change applies from the next cycle.
- **`onStatusChange` runs inside the same MongoDB transaction** as the status change it reports
  (decide, withdraw, reopen). The owning module writes through the passed context; if it
  throws, the approval change rolls back too. Submit/resubmit accept an optional context the
  other way round, so an owning module can save its record and submit in one transaction.
  `TransactionRunnerPort` / `TransactionContext` and the Mongoose runner move from Identity to
  `src/shared/db/` so a transaction can span modules.

**Why:** Kinds are registered at runtime by owning modules, but `SystemConfig` only lets Admin
edit keys that were seeded — a key per kind would have to be seeded before its kind exists. And
an after-commit callback could leave the approval saying "approved" while, say, the leave
balance was never deducted; one transaction makes that impossible.

**Consequences:** handlers must keep to database writes on the context (a transient-error retry
can run them twice); notifications go elsewhere (F8). Owning modules should read status from the
approval module (`getForRecord`) rather than keep their own copy.

**Refs:** `apps/api/src/modules/approval/application/applyTransition.ts`,
`apps/api/src/shared/db/`, `apps/api/src/modules/config/application/usecases/seedDefaultConfig.usecase.ts`

---

## 2026-09-24 — An Admin override at Stage 1 is a final approval

**Decision:** When Admin approves a request still waiting on the submitter's manager
(`SUBMITTED`), it goes straight to `APPROVED`, recorded with authority `ADMIN_OVERRIDE`.
**Reverses** HLD 05 §5, where the override applied only the Stage-1 transition (`SUBMITTED →
MANAGER_APPROVED`). A top-of-chain request (no manager) likewise ends in one step at the final
approver (`TOP_OF_CHAIN`), as PRD §7.1.4 already said. Only the manager's own approval stops at
`MANAGER_APPROVED` (and only when the kind's workflow has a final stage).

**Why:** Admin is the final authority on every kind. Under the old rule Admin would approve the
same request twice in a row — a second click, not a second check.

**Consequences:** HR gets no Stage-1 override, even on Leave — HR acts at the final stage, or
directly only when the submitter has no manager. The history's `authority` field always shows
which path a decision took.

**Refs:** `apps/api/src/modules/approval/domain/approvalRules.ts`, `docs/hld/05-approval-workflow-engine.md` §5

---

## 2026-09-24 — Phase 3: the approval engine becomes a module; Admin is a real second stage

**Decision:** Agreed with the product owner before building Phase 3, after reading the client's
`RULES BY GREYNOTE.docx` §19 against HLD 05:

- **An `approval` module (tier 2), not a shared library.** Reverses HLD 05 §1 and the roadmap's
  "not a module, not a tier". It owns an `ApprovalRequest` collection: kind, the owning module's
  record id, submitter, current stage/status, and a full action history (who, when, comment). The
  owning module (Planning, HR, …) creates the request and is called back on each decision through
  a handler registered at the composition root, so the lower tier never imports the higher one.
- **Stage 2 is a real approval, not record-keeping.** Status runs `SUBMITTED →
  MANAGER_APPROVED → APPROVED`, with `REJECTED` possible at either stage (client §19.3:
  "first immediate manager & then Admin"). Each owning module decides which status unlocks what
  for it (e.g. HLD 10's DCR gate needs only a Manager-approved Plan).
- **Per-kind workflow in `SystemConfig`**: `MANAGER_THEN_FINAL` (default) or `MANAGER_ONLY`, so
  the client can drop the second stage for high-volume kinds (e.g. Daily Plans) without a
  release — and the still-open F1 list doesn't block the build. Who may act at the final stage is
  fixed per kind in code: **ADMIN**, or **HR or ADMIN for Leave**.
- **Leave goes Employee → Manager → HR/Admin** (product owner, matching client §11.2). Reverses
  PRD §5.3 / `LLD/hr.md`'s "HR approves directly, bypassing the manager chain" — Leave now uses
  the engine like everything else.
- **Doctor creation goes Employee → Manager → Admin** (product owner; client §4.2, sign-off C4).
- **Approved means locked for the employee; Admin can override.** Once `APPROVED` (or
  `MANAGER_APPROVED` on its way there) the submitter can't edit or withdraw. Admin can reopen an
  approved request (reason required, history kept), and each owning module lets Admin edit its
  own approved records.
- **The approver is resolved when someone acts, from the submitter's *current* manager** — not
  snapshotted at submission — so a reassigned employee's pending items move to the new manager.
  Admin's standing Stage-1 override (entry below, 2026-09-23) still covers an inactive/absent
  manager. Needs Identity `getDirectReports` / `getDownline` (the Team tab needs them anyway).
- **Engine-wide rules:** a rejection needs a reason; the submitter can withdraw until the
  manager acts (client §11.4); a rejected request can be resubmitted as a new cycle on the same
  request, history kept; nobody approves their own request; managers and Admin can bulk-approve;
  decisions emit an event where notifications will plug in (F8 still open).

**Why:** the client wants one common approval screen (§19.6) across many kinds (§19.3: DCR,
Expense, Leave, Doctor Service, Doctor Creation/Location, Sample, Gift, Order, change requests).
A library leaves each kind's status in its own collection, so that screen and Admin's org-wide
queue (HLD 05 §5) would have to query and merge every module's collection; a module with one
collection answers both with one query and gives a uniform audit trail.

**Consequences:**
- HLD 05, `LLD/hr.md` (leave approval), the roadmap's Phase 3/4 text and the PRD §5.3 leave
  wording are superseded; HLD 05 is rewritten as part of the Phase 3 build.
- `.dependency-cruiser.cjs` `MODULE_TIERS` gains `approval` in tier 2 beside `territory`.
- Reopening an approved request must later respect a Finalized PayrollRun (Phase 7): a month
  already paid stays locked.

**Refs:** `docs/hld/05-approval-workflow-engine.md`, `docs/LLD/hr.md`, `docs/roadmap.md`,
`docs/client-sign-off.md` C4/F1/F9, client `RULES BY GREYNOTE.docx` §4.2, §11.2, §11.4, §19

---

## 2026-09-24 — Phase 2 (Territory) build decisions

**Decision:** Agreed with the product owner before building Territory:

- **Google Maps** (Places API (New) for search, Routes API for distance — the legacy Places /
  Directions APIs can't be enabled on new projects), behind `PlaceSearch` /
  `DistanceProvider` ports so a cheaper provider (Ola Maps, OSRM) is one adapter away. Tests use a
  fake adapter. Directions caps a request at 25 waypoints, so a Route accepts at most 25
  (origin + destination + 23 via).
- **The API proxies place search**: `GET /api/territory/places/search?q=`. The Google key never
  leaves the server, and waypoint entry is testable from Swagger before the web portal exists.
- **Distance is calculated during the save**, with a timeout (~5 s). Failure saves the Route as
  `FAILED`; Admin retries with `POST /api/territory/routes/:id/recalculate`. `PENDING` is dropped
  from `distance_status`: nothing runs in the background, so nothing is ever pending. A
  `revision` counter, bumped by every waypoint/distance write, makes concurrent edits safe (a
  stale revision is rejected, not silently overwritten). *(Planned as `waypointsVersion`; widened
  while building so a slow recalculation can't overwrite a manual override made meanwhile.)*
- **`distance_km` is used as-is for TA — no ×2 for the return trip.** Admin defines the route (or
  overrides the distance) to cover the full travel the company pays for.
- **Names are unique within their parent**, case-insensitive (Zone globally, HQ per Zone, Area
  per HQ, Route per Area). **Nothing is hard-deleted**: a Zone/HQ/Area can't be deactivated while
  it has active children, and a Route can't be deactivated while it has active assignments.
- **CSV bulk import for Zone / HQ / Area** (not Routes — each waypoint needs a confirmed map pin).
- **Client sign-off D5 answered: a Route always uses its Area's type.** No per-Route override.

**Why:** these were the points the LLD/HLD left open or contradicted (HLD 02 describes a blocking
call yet the ERD had a `PENDING` status; the LLD had no edit/deactivate endpoints and no retry for
a failed calculation). Round-trip handling was raised because TA money depends on it; the owner
chose to keep it an Admin data-entry concern rather than a rule in code.

**Consequences:**
- Admin must remember the no-×2 rule when entering or overriding distances; the system won't
  catch a one-way figure for a round-trip route.
- A `GOOGLE_MAPS_API_KEY` is needed in every environment that creates or edits Routes; without it
  routes still save, as `FAILED`.

**Refs:** `docs/LLD/territory.md`, `docs/hld/02-route-distance-calculation.md`,
`docs/erd/02-territory-master.md`, `docs/client-sign-off.md` D5

---

## 2026-09-24 — Field devices need Admin approval; Admin device actions and password reset

**Decision:** The client answered sign-off group A: password login for now, 2 devices for field
employees, Admin approval for new devices, Admin can remove / log out a device, no limit for
Admin/HR/Accountant, Admin-only password reset. **Reverses** the Phase 1 device rule ("count
active sessions; at the limit, block with 'log out from another device first'"):

- New `UserDevice` registry (FIELD only). **Every** new phone, the first included, becomes a
  `PENDING` request and can't log in until Admin approves it.
- `MAX_REGISTERED_DEVICES_FIELD` (replaces `MAX_ACTIVE_DEVICES_FIELD`, default `2`) counts
  pending + registered phones. At the limit a new phone is refused and **no** request is
  created; Admin must remove an old phone first. Logging out never frees a slot.
- A rejected phone is blocked for `REJECTED_DEVICE_TTL_DAYS` (default `7`); a MongoDB TTL index
  then deletes the rejection and the phone counts as new.
- `UserSession.revokedReason`: only reuse of a `ROTATED` refresh token counts as theft.
- Admin-only endpoints: pending queue, per-employee device list, approve, reject, remove, log out
  one phone, reset password.

**Why:** the client's rules (§20.3) want new devices controlled by Admin. Counting sessions let
an employee swap phones freely just by logging out. The revocation reason is needed because
without it, the first background refresh from a phone Admin removed would have been treated as
theft and logged the employee out of their other, legitimate phone.

**Consequences:**
- Existing field users (none in dev) would need their phones approved once after deploy.
- Two new phones logging in at the same instant could both pass the limit check before either
  request is written (limit + 1 pending). Not guarded; Admin simply rejects the extra one.
- The Android app must send `ANDROID_ID` etc. in the login body — documented in
  `LLD/identity.md` "Where `device_id` and `device_name` come from".

**Refs:** `apps/api/src/modules/identity/{domain/userDevice.entity,application/usecases/login.usecase,interface/devices.route}.ts`,
`docs/hld/04-authentication-and-sessions.md`, `docs/LLD/identity.md`, `docs/client-sign-off.md` A

---

## 2026-09-24 — `PayBand.daAmount` split into `hqDa` / `exStationDa` / `outStationDa`

**Decision:** Closes the code mismatch flagged in the entry below. `PayBand` now stores three DA
rates, one per `Area.type`, all `Decimal128` and all required on create. `daAmount` is removed
outright, not kept as an alias.

**Why:** Phase 6's DA calculation (HLD-06 §2) needs a rate per Area type, and the mismatch was
cheapest to fix now, while only Admin master data depends on `PayBand`.

**Consequences:** existing `PayBand` rows that only have `daAmount` can't be read by the new
adapter and need the three fields backfilled. Night Stay is still not a field, because its
trigger is still undefined.

**Refs:** `apps/api/src/modules/identity/{domain/payBand.entity,infrastructure/payBand.schema,infrastructure/mongoPayBand.adapter}.ts`

---

## 2026-09-24 — Territory, Distributor, Doctor assignment and DA re-aligned to the client's Master spec

**Decision:** **Reverses** four earlier design calls. None had a decision-log entry of its own;
each lived as a "locked" bullet in an ERD/LLD doc:

- **`Area` added: `Zone → HQ → Area → Route`.** Reverses ERD-02's "Three-level hierarchy, no
  Area" and `LLD/territory.md`'s "Area... considered and dropped". `Route.hq_id` becomes
  `Route.area_id`. `Area` carries `type: HQ | EX_STATION | OUT_STATION`.
- **DA is per Area type, not flat.** Reverses HLD-06's `da_amount = pay_band.da_amount`. Each
  grade has `hq_da`/`ex_station_da`/`out_station_da`, and a day's DA uses the rate for its routes'
  Area type (highest type wins if mixed; `MEETING`/`CONFERENCE` default to HQ — both provisional,
  see HLD-06 §2).
- **Distributor attaches to a Route, not an HQ.** Reverses ERD-03's "Distributor attaches at the
  HQ level". Also gains `latitude`/`longitude` (reversing "Distributor doesn't get this"),
  `gst_number`, `contact_person`, `mobile`, single-value `assigned_mr_id`/`assigned_asm_id`, and
  primary/secondary-sales flags. An MR can act on a Distributor if it's their `assigned_mr_id` or
  their `RouteAssignment` covers its Route. This resolves `LLD/sales-and-orders.md`'s open
  "territory gating on Order creation" question.
- **One active `DoctorAssignment` per Doctor.** Reverses ERD-03's "a doctor can have more than
  one MR assigned". The table stays, as history plus a partial unique index on active rows.
  Managers reach the doctor through the reporting chain, not extra rows.

Also added: `SystemConfig.MONTHLY_STOCK_SUBMISSION_DAY` (seed default `5`) as the Admin-set
cut-off for monthly Distributor stock entry.

Considered and **rejected** on the way: an `AreaAssignment` (MR↔Area) and `DistributorArea` join
to gate Distributor access by Area. The client spec gates by Route + a direct assigned MR, so a
second assignment mechanism would duplicate `RouteAssignment`. Also rejected: scoping each
manager designation to a territory level (ASM→Area, ZSM→Zone, NSM→national). Client rules §18
define manager visibility purely by reporting chain, which `getDownline` already does. Orgs
missing a level (no ZSM/NSM) are already covered by HLD-05 §2/§5's Admin fallback.

**Why:** the ERD/LLD were first written from the PRD alone. The client's own Master spec
(`MASTER V2.docx` M1/M2/M4/M6, `RULES BY GREYNOTE.docx` §8/§14–18/§31, `sales.docx` S6) is more
specific and disagreed on each point. The one-doctor-one-MR rule was answered directly by the
product owner in this discussion, not taken from the spec, where it's still an open question.

**Consequences:**
- **Code mismatch, not fixed yet:** `PayBand` (Identity, Phase 1, shipped) has one flat
  `daAmount`. It must become three per-area-type rates (plus Night Stay once its trigger is
  defined) before Phase 6 builds DA. The 2026-09-23 "`Decimal128`, provisional" entry already
  flagged `PayBand`'s money fields as revisable; this adds a concrete reason.
- Territory and Field Master Data aren't code yet, so their reshaping costs nothing now.
- Still open with the client, left unresolved in the docs rather than guessed: Night Stay DA
  trigger, holiday/weekly-off effect on DA, the mixed-area-type tie-break, whether a Route can
  override its Area's type, and approval-based re-open of a closed stock month.

**Refs:** `docs/erd/02-territory-master.md`, `docs/LLD/territory.md`,
`docs/erd/03-field-master-data.md`, `docs/LLD/field-master-data.md`,
`docs/hld/06-ta-da-auto-calculation.md`, `docs/LLD/sales-and-orders.md`,
`apps/api/src/modules/identity/domain/payBand.entity.ts`

---

## 2026-09-24 — `SystemConfig` gets an Admin write path; Admin gets blanket Stage-1 approval override

**Decision:** Two additions to the not-yet-built Planning/Approval design, both scoped ahead of
that module's implementation so neither gets built the old way first:

- **`SystemConfig` (Module 5, `hld/03` §3) gains an Admin-facing write path.** Today it only has a
  seed step and a read-only `getConfigValue` use case — nothing lets Admin actually change
  `DCR_MISS_GRACE_DAYS` from its default of `1` to `2` or `3`. A `PATCH` on a config key, ADMIN-only,
  closes that gap. No schema change — `SystemConfig.value` was already a plain string.
- **Admin gains a blanket override on Stage-1 approval** (`hld/05`), not just the existing
  `manager_id IS NULL` case. Any `SUBMITTED` record — Daily Plan, Monthly Plan, DCR — can be
  approved or rejected directly by any ADMIN-role user, regardless of who the nearest manager is
  or whether that manager can currently act.

**Why:** the second decision is the direct answer to "what happens when the nearest manager can't
approve" — resigned/deactivated, on leave, forgot, or simply unreachable. Detecting *which* of
those applies would mean new state on `User`/`EmployeeProfile` (an unavailability flag, a delegate
field, leave-calendar integration) and separate handling per case. A blanket, always-on Admin
override needs none of that: it's the same one mechanism regardless of reason, and it's already
consistent with `hld/05` §4's existing principle that Admin visibility is role-based, not
hierarchy-based — this just extends that principle one stage earlier, from read access on
`MANAGER_APPROVED` records to approve/reject action on `SUBMITTED` ones. The config write path is
bundled into the same entry because it's what makes the first, already-designed rule
(`DCR_MISS_GRACE_DAYS`) actually operable instead of a seed-only default.

**Consequences:**
- `hld/05` gains a `§5 Admin override` section; `LLD/planning.md`'s HTTP surface table gains
  `GET /admin/approvals/pending` (org-wide, filterable by `managerId` and date range — reusing
  `EmployeeProfileRepositoryPort.findUserIdsByFilter`, defined but unused today) and
  `POST /admin/approvals/:id/approve` / `/reject`.
- No new field on `DailyPlan`/`MonthlyPlan`/`DCR` to flag "admin override" — `reviewed_by` already
  points at whichever `User` acted, and that user's `roleId` being `ADMIN` is itself the signal.
  Revisit only if a future report needs to isolate overrides without that join.
- Documentation-only for now — Planning/Approval isn't code yet (only `config`, `health`,
  `identity` are real modules under `apps/api/src/modules/`). Recorded ahead of that build so it
  isn't designed without either rule.

**Refs:** `docs/hld/05-approval-workflow-engine.md` §5, `docs/hld/10-submission-gating-and-compliance-block.md` §2,
`docs/erd/05-planning-and-rules.md`, `docs/LLD/planning.md`

---

## 2026-09-23 — `Route.ta_per_km_rate_override`: a per-route default override for TA

**Decision:** `Route` (Territory, Module 2 — not yet built) gains an optional
`ta_per_km_rate_override: decimal, nullable` field. `PayBand.ta_per_km_rate` (Module 1) remains
the default; when a route has this set, it takes precedence for travel on that specific route.
TA/DA auto-calculation (`hld/06` §2) resolves the rate **per route**, not once for the whole day —
`ta_amount = sum over routes where CALCULATED of distance_km × (ta_per_km_rate_override ??
pay_band.ta_per_km_rate)` — since a `DailyPlan` can carry multiple routes, each potentially with
its own override. Unlike `Route.distance_km`'s `MANUAL_OVERRIDE`, this does **not** reset on a
waypoint edit (it's a negotiated fact, unrelated to geography) and needs no `_source`/`_status`
provenance pair — it's simply present or absent.

**Why:** lets Admin set a higher rate for a specific remote/difficult route without creating a
whole new `PayBand` grade just for it, matching how real per-km reimbursement negotiations
actually work.

**Consequences:** documentation-only for now — `Territory`/`Route` isn't code yet (roadmap Phase
2), and TA/DA calculation is Phase 6. Recorded ahead of both landing so neither implements the
old single-rate-per-day formula.

**Refs:** `docs/erd/02-territory-master.md`, `docs/hld/06-ta-da-auto-calculation.md` §2

---

## 2026-09-23 — Split `User` into a lean account + `EmployeeProfile`/`ComplianceBlock`

**Decision:** **Reverses** (per this log's append-only rule, the two entries below stay as
history, not edited) both the "Identity's `User` gains onboarding fields..." entry and the
"compliance block history embedded on `User`" direction from earlier the same day. `User` shrinks
to a lean account/org-identity record for every role: `employeeCode`, `name`, `email`, `phone`,
`status`, `roleId`, `passwordHash`, `lastLoginAt`, `isBlocked`. Two new collections take
everything else:

- **`EmployeeProfile`** — FIELD-only, one per `User`, created **lazily** on the first onboarding
  `PATCH` (not at `User` creation — `POST /users` never touches it). Holds
  `designationId`/`payBandId`/`managerId`/`dateOfJoining` (moved off `User` — all four were
  already FIELD-only in practice) plus the personal/bank/document onboarding bundle from the
  earlier entry.
- **`ComplianceBlock`** — one document per block **event**, not a single overwritable set of
  fields — a second block later in an employee's tenure no longer erases the first one's reason
  and timestamps. `User.isBlocked` stays as a fast top-level flag; the row is where the detail
  lives. Retention is **indefinite** — no TTL — matching how the rest of the system treats
  history (`hld/09`'s FY toggle only ever scopes what's shown, never deletes).

**Why:** `User` had accumulated a pile of fields that are always null for 3 of the 4 roles
(`ADMIN`/`HR`/`ACCOUNTANT` never touch onboarding data), and compliance-block history is
open-ended over an employee's whole career — both are exactly the kind of data worth separating
from an auth-critical record (`passwordHash`, `roleId`) before real data exists, the same
"decide before it's expensive to change" reasoning as the `Decimal128` money decision. Discussed
and confirmed along the way: dangling references aren't a new risk this split introduces —
nothing in this system is ever hard-deleted (`Role`/`Designation`/`PayBand` have no `DELETE`
endpoint, `User` is soft-deactivated, `UserSession` is soft-revoked) — and the two places
stale-value drift actually matters financially (`PayrollRun.base_salary`, generated TA/DA
`Expense` amounts) already have their own documented locked-snapshot rule, unaffected by this.

**Consequences:**
- `CreateUserInput` simplifies to one shape for every role
  (`{role, employeeCode, name, password, email?, phone?}`) — `designationId`/`payBandId`/
  `managerId` are no longer accepted at creation, only via the onboarding `PATCH`. `createUser`
  goes back to a single-collection write.
- `unblockUser` now writes to two collections (close the open `ComplianceBlock`, flip
  `User.isBlocked`) and does so inside **this codebase's first MongoDB transaction**
  (`TransactionRunnerPort`/`MongooseTransactionRunner`) — every other write in this system remains
  a single-document update, which MongoDB already makes atomic on its own.
- `listUsers`'s designation/manager filters and `UserSummary`'s designation/manager fields now
  require resolving `EmployeeProfile` — handled as a two-phase query (resolve matching `userId`s
  from `EmployeeProfile` first, then filter `User` by `_id`), not a `$lookup` aggregation —
  simpler to reason about and sufficient for this filter's low, Admin-driven query volume.
- A new `GET /api/identity/users/:id` endpoint exists now, since `UserSummary` never carried
  personal/bank details and nothing else exposed a user's full onboarding profile.
- `docs/erd/01-identity-hierarchy.md` and `docs/LLD/identity.md` are rewritten to describe the new
  shape rather than the one from earlier today.

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,employeeProfile.entity,complianceBlock.entity,transactionRunner.port}.ts`,
`apps/api/src/modules/identity/application/usecases/{createUser,updateUser,unblockUser}.usecase.ts`

---

## 2026-09-23 — Bootstrap Admin via an interactive seed script, not env vars

**Decision:** **Reverses** the "Bootstrap Admin seeded from env vars, exactly once" entry below,
from the same day. `BOOTSTRAP_ADMIN_EMPLOYEE_CODE`/`_NAME`/`_EMAIL`/`_PHONE`/`_PASSWORD` are
removed from `env.ts`'s schema entirely. In their place, `apps/api/src/scripts/seed.ts` — a
second composition root alongside `container.ts`, exactly the shape
`docs/engineering/module-anatomy.md` anticipated for "a worker process, a script" — seeds
`SystemConfig` defaults and the 4 fixed `Role` rows, then, only if no `ADMIN` user exists yet,
**interactively prompts** an operator for the first Admin's details (password entry masked, typed
twice) rather than reading them from environment configuration. Run via `pnpm --filter
@greynote/api seed` in dev, or `node dist/scripts/seed.js` inside the running container in prod
(`docker compose exec`). `buildContainers()` in `container.ts` no longer calls any seed method —
server boot does zero DB writes as a side effect of starting.

**Why:** the env-var approach meant a plaintext admin password had to sit in `apps/api/.env.prod`
for the entire life of a deployment, readable by anything with host/container access, long after
it served its one purpose. It also meant every server process did DB write queries on boot as an
implicit side effect of starting up. Neither is a correctness bug — the seeding itself was
already idempotent (`$setOnInsert` for Config, existence-checks for Role and the bootstrap Admin),
so a restart never clobbered an Admin's edits — but "seed the database" deserves to be an
explicit, operator-triggered action, the same way a schema migration is, not invisible behavior
baked into `npm start`.

**Consequences:** `apps/api/.env.example` and `.env.prod.example` lose the `BOOTSTRAP_ADMIN_*`
block. A fresh environment (dev or prod) needs one manual `pnpm --filter @greynote/api seed` /
`node dist/scripts/seed.js` run before the first login attempt — documented in
`setup-development.md` and `manual_deploy.md`. `esbuild.config.mjs` gained a second entry point
(`src/scripts/seed.ts` → `dist/scripts/seed.js`) so the script ships in the prod image alongside
`dist/server.js`. New runtime dependency: `prompts` (masked password input) — a real
`dependencies` entry, not `devDependencies`, since the script must run from the prod image's
`pnpm deploy --prod` node_modules, not just via `tsx` in dev.

**Refs:** `apps/api/src/scripts/seed.ts`, `apps/api/src/container.ts`,
`apps/api/src/modules/identity/identity.container.ts`,
`docs/engineering/module-anatomy.md`

---

## 2026-09-23 — Identity's `User` gains onboarding fields, a `pending` status, and defers Zone/HQ

**Decision:** `User` (ERD Module 1) grows beyond `docs/erd/01-identity-hierarchy.md`'s original
field list to support a step-by-step Admin onboarding flow for FIELD employees: personal details
(`mobile_number`, `guardian_name`, `date_of_birth`, `address`, `qualification`), bank details
(`bank_name`, `ifsc`, `account_number`, `account_holder_name`, `branch_name`), and an array of
uploaded documents. `status` widens from `active/inactive` to `active/pending/inactive` —
`pending` means onboarding incomplete, kept distinct from `inactive` (deactivated/offboarded) so a
future Payroll query for "active FIELD employees" can't accidentally include someone
mid-onboarding. `status` is auto-computed (not a separate "activate" action) every time
`PATCH /api/identity/users/:id` changes one of the required-for-activation fields — see
`domain/onboarding.ts`'s `computeUserStatus`, which never upgrades an already-`inactive` user back
to `active`/`pending` as a side effect. Zone→HQ is deliberately **not** added here — Territory
(Phase 2, one tier above Identity) doesn't exist yet, and ERD-01's own "Next" section already
planned for that FK to land with Module 2, not Module 1.

**Why:** the PRD/ERD didn't originally specify these fields, but real Admin onboarding needs them,
and a FIELD employee shouldn't be usable (assignable, able to submit) until the record is actually
complete. Auto-computing status (rather than a manual activate call) means every onboarding PATCH
naturally converges on `active` the moment the last required field lands.

**Consequences:** `docs/erd/01-identity-hierarchy.md` needs its `User` entity and `status` field
updated to match this. `docs/LLD/identity.md`'s HTTP surface table gains
`POST /users/:id/documents` and `DELETE /users/:id/documents/:documentId`, and its create-user
row should note the discriminated payload shape (decision below).

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,onboarding}.ts`

---

## 2026-09-23 — One `POST /api/identity/users`, discriminated by role

**Decision:** the LLD's single `POST /api/identity/users` endpoint takes a Zod discriminated
union on `role`: a `FIELD` payload accepts the full onboarding shape (minimal at creation,
filled in incrementally via `PATCH`); an `ADMIN`/`HR`/`ACCOUNTANT` payload — the "user master"
path — is the short form (`employeeCode, name, email, phone, password, role` only), created
`active` immediately. Creating a non-FIELD user is Admin-only; creating a FIELD user is Admin or
HR, per the LLD's existing HR-field-force-only restriction. Enforced in `CreateUserUseCase`, not
just at the route.

**Why:** keeps the one HTTP surface the LLD already documents rather than adding a second
endpoint, while still giving Admin/HR/Accountant creation ("user master") a genuinely simpler
shape than FIELD onboarding — none of designation/pay-band/bank/manager/documents applies to them.

**Refs:** `apps/api/src/modules/identity/application/usecases/createUser.usecase.ts`,
`interface/users.schemas.ts`

---

## 2026-09-23 — Password hashing: bcrypt, with its 72-byte limit enforced not truncated

**Decision:** `bcrypt` (the `bcrypt` npm package, cost factor from `BCRYPT_COST_FACTOR`, default
12) hashes every `User.passwordHash`. Its 72-byte input limit is enforced at the Zod DTO layer
(`Buffer.byteLength(password, 'utf8') <= 72`, rejected with 400) on both password creation and
login — not silently truncated, which would otherwise let two different passwords sharing the
same first-72-byte prefix hash (and authenticate) identically.

**Why:** `docs/engineering/tech-choices.md` and `.env.example` had left bcrypt vs. argon2 open.
bcrypt ships prebuilt native bindings for common deploy targets (no build-toolchain risk the way
`argon2`'s native addon can carry) and is the specific standard for password hashing.

**Refs:** `apps/api/src/modules/identity/infrastructure/bcryptPasswordHasher.adapter.ts`,
`interface/password.schema.ts`

---

## 2026-09-23 — Bootstrap Admin seeded from env vars, exactly once

**Decision:** `identity`'s boot sequence seeds exactly one `ADMIN`-role `User` from
`BOOTSTRAP_ADMIN_*` env vars, gated on "does any ADMIN-role user exist" (not a one-time flag, so
it self-heals if the DB is ever reset) rather than a fixed run-once marker. Every Admin/HR/
Accountant after that first one is created the ordinary way — through that Admin's own
authenticated `POST /api/identity/users` call.

**Why:** creating a `User` normally requires an authenticated Admin, which is impossible on a
genuinely empty DB — this is the one exception, solving the chicken-and-egg problem without a
second, permanently-open creation path.

**Refs:** `apps/api/src/modules/identity/application/usecases/seedBootstrapAdmin.usecase.ts`

---

## 2026-09-23 — Money storage: `Decimal128`, provisional pending Payroll

**Decision:** `PayBand.base_salary/ta_per_km_rate/da_amount` (the first money fields to land) use
Mongoose `Decimal128` in `infrastructure/payBand.schema.ts`. The domain entity keeps them as
decimal **strings** — `domain/` never imports Mongoose (2026-09-19 decision) — so the conversion
lives only in `infrastructure/mongoPayBand.adapter.ts`.

**Why:** `docs/engineering/coding-standards.md#money` flagged this as undecided but required
before Phase 1, and named `Decimal128` as its own standing fallback pending a final choice against
driverzone's integer-subunit convention. Deliberately **provisional** — this entry exists so
Payroll (Phase 7) either ratifies or deliberately overrides it, not silently inherits it.

**Refs:** `docs/engineering/coding-standards.md#money`,
`apps/api/src/modules/identity/infrastructure/{payBand.schema,mongoPayBand.adapter}.ts`

---

## 2026-09-23 — MongoDB Atlas in every environment; no local Mongo container

**Decision:** `MONGO_URI` points at a MongoDB Atlas cluster in both development and production.
`docker-compose.dev.yml` and `docker-compose.prod.yml` define **no `mongo` service** in either
file.

**This reverses the pattern in the sibling reference project `../driverzone`**, which runs Mongo
as a local single-node replica set in `docker-compose.dev.yml` (with a one-shot `mongo-init`
container to promote it) for development, and a Docker-network-only Mongo service in
`docker-compose.prod.yml` for production.

**Why:** an Atlas cluster is already a replica set, so none of driverzone's `mongo-init`/
`directConnection=true` single-node bootstrap is needed here even if a module later needs
multi-document transactions. It also means one fewer moving part in local development — no
`docker compose up` before `pnpm dev`, no "did the replica-set init run" troubleshooting entry —
and production gets Atlas's managed backups and monitoring instead of a self-managed volume on
the deploy VM.

**Consequences:** `docs/setup-development.md` has no "start the dev stack" step; first-time setup
is `.env` pointing at a dev Atlas connection string, then `pnpm dev`. Clearing local dev data is
dropping collections on the Atlas dev cluster, not `docker compose down -v`. Production deploys
need the VM's egress IP allowlisted on the Atlas project before the API container can connect —
documented in [`manual_deploy.md`](manual_deploy.md). Every developer and every deploy target
needs network access to Atlas, which a fully offline/local-only setup (driverzone's default) does
not require.

**Refs:** `docker-compose.dev.yml`, `docker-compose.prod.yml`, `apps/api/.env.example`,
`apps/api/.env.prod.example`, [`setup-development.md`](setup-development.md)

---

## 2026-09-23 — Web portal is Next.js

**Decision:** `apps/web` (Admin/HR/Accountant portal, [`roadmap.md`](roadmap.md) phase 9) is
built on Next.js, matching `../driverzone/apps/web`'s stack and deploy pattern (standalone
output, `NEXT_PUBLIC_*` as Docker build args, same-site cookie auth if the eventual auth design
uses one).

**Why:** no HLD doc had picked a web stack yet — only the mobile stack was decided
(`hld/03-system-architecture.md` §1: React Native + SQLite). `apps/api`'s architecture was
already deliberately aligned to driverzone's (commit `041c5bd`), and Next.js is the specific
choice that keeps the eventual `build-and-deploy.md` and Dockerfile structure a copy of a proven
pattern rather than a second one to maintain.

**Consequences:** none yet — `apps/web` is not scaffolded. This entry exists so the choice is
recorded before Phase 9 starts, not discovered mid-scaffold.

**Refs:** [`roadmap.md`](roadmap.md) phase 9, [`engineering/tech-choices.md`](engineering/tech-choices.md)

---

## 2026-09-19 — Architecture aligned with the driverzone reference (shared kernel, module boundaries, tooling)

**Decision:** `apps/api` adopts the same architecture as `../driverzone/apps/api`: 4-layer
modules (`domain/application/infrastructure/interface`), a `.container.ts` composition root and
a `.public.ts` contract per module, and a `dependency-cruiser`-enforced tier graph
(`MODULE_TIERS`) mapping the 9 ERD modules onto explicit dependency tiers.

**Why:** the same shape had already proven out on a different product, and the specific problem
it solves — a module reaching into another's internals instead of a typed contract — is exactly
as real in a modular Mongoose monolith as it was there. Reusing a working pattern rather than
inventing a second one for a second product.

**Consequences:** `docs/hld/03-system-architecture.md` documents the tier mapping for greynote's
9 modules; `docs/engineering/` (this repo's engineering handbook, written to mirror driverzone's)
documents the pattern itself. The `health` module is the reference implementation every future
module copies from.

**Refs:** commit `041c5bd`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/module-anatomy.md`](engineering/module-anatomy.md)

---

## 2026-09-19 — Mongoose over the prior data-access approach

**Decision:** MongoDB via Mongoose is the persistence layer; Mongoose schema validation is the
primary validation at the persistence boundary, applied only inside each module's
`infrastructure/` adapter.

**Why:** captured in the PRD's switch-to-Mongoose commit; the ERD's ORM-agnostic entity language
(FK/join-table style) maps onto MongoDB with referential integrity enforced in the repository
adapters rather than the database, per `hld/03-system-architecture.md` §4.

**Consequences:** `domain/` and `application/` layers never import Mongoose — domain entities
stay plain TypeScript types — so a schema/model always lives in exactly one module's
`infrastructure/`, never shared, per `module-internals-are-private`.

**Refs:** commit `d52b99e`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md) §4
