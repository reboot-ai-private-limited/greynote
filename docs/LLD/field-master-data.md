# Field Master Data

The catalog of who and what a field call is actually about: Doctors, Chemists, Distributors and
Products, plus the two allocation/assignment relationships that decide who may act on a given
Doctor. ERD: [`../erd/03-field-master-data.md`](../erd/03-field-master-data.md). PRD: §5.1
(Route & Territory Master's "Assignments"/"Location Verification" subsections) and §6.2.A
(Doctor Samples). Tier 3 in `apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS`, module folder
`field-master-data`. Roadmap: [`../roadmap.md`](../roadmap.md) phase 4, alongside Planning and HR
— same tier, parallelizable.

## Build status

Built so far (Phase 4 Field Master Data steps 1–5, `../roadmap.md`): the module skeleton
(`apps/api/src/modules/field-master-data`, mounted at `/api/field-master-data`), **Products**,
**Chemists**, **Doctors** with their assignments, the MR-added Doctor with its approval
(*Doctor-creation approval* below), **Distributors** and **sample allocations** — the module's
whole data model. The contract below is complete for Phase 6's needs.

- **Products:** `sku` is unique ignoring case and surrounding spaces (a duplicate is a 409).
  `status` is `active` or `inactive`; nothing is ever deleted. List filters: `search` (name or SKU),
  `category`, `status`.
- **Chemists:** always on one Route, which must exist and be **active** when the Chemist is created
  or moved (Territory's `getRoute`); editing a Chemist whose Route has since gone inactive is fine
  as long as the Route isn't changed. The location is a `{ latitude, longitude }` pair — both or
  neither, range-checked — picked on a Google map; it may be left out at creation and set later, and
  an edit can correct or clear it (`null`). List filters: `search` (name), `routeId`, `status`.
- **Doctors (step 3, Admin-created):** a Doctor sits on one active Route, with category, name,
  address, specialty, qualification, an optional email and an optional map-picked location (both
  coordinates or neither; an edit corrects or clears it). Admin-created Doctors are `active` at once
  with `approvedAt` set. Deactivating ends the MR's assignment in the same step (2026-10-22; see *Taking a doctor out of service*).
- **Assignments:** `POST /doctors/:id/assignments` needs an active FIELD employee who currently has
  the Doctor's Route (409 otherwise), replaces the current MR in one transaction and keeps the old
  row as history; assigning the current MR again changes nothing. The database allows one active row
  per Doctor (partial unique index), so racing reassignments can't leave two.
- **Visibility** is as in *Who can see a Doctor*: `GET /doctors/mine` (an MR), `GET /doctors/team`
  (a manager, optionally narrowed to one report in their downline) and `GET /doctors/:id` (Admin, the
  assigned MR, or their manager — anyone else gets a 404, so a Doctor's existence isn't revealed).
  Inactive Doctors show only to Admin. Checked live: losing a Route hides the Doctor, giving it back
  restores it, and the switch off keeps it.
- **Distributors (step 5, Admin-only):** on an active Route, with GST number (15-character GSTIN,
  upper-cased), contact person, mobile, address, an optional map-picked location, **one or more Routes
  that must all be in one Zone** (`ROUTES_IN_DIFFERENT_ZONES` otherwise; a Route already on it that has since
  gone inactive can stay), and a **list of assigned people** (`assignedUserIds`): active FIELD employees of any
  designation (decision-log 2026-10-09; the order flags and the one-MR-one-ASM slots are gone). A person already in
  place who later goes inactive can stay until Admin removes them. The list filters by `routeId`, or by the `hqId` / `zoneId` above it (the
  most specific one given, resolved to Route ids through Territory's `listRouteIdsInScope`), by
  `assignedUserId`, and by name / GST; the detail adds the Zone → HQ breadcrumb through the Route.
- **Sample allocations (step 5):** one row per (Doctor, Product). `POST /doctors/:id/sample-allocations`
  issues samples and **adds** to an existing row (a first-time issue is an atomic upsert, so racing
  issues sum correctly); `PATCH …/:productId` corrects the allocated total but never below what has
  already been given out. Only an active Doctor and an active Product qualify. The remaining count
  moves only through `decrementRemaining`, a single conditional update, and the database refuses
  a negative one as well — checked live: 30 concurrent gives against 12 in stock, exactly 12 succeed.
  Admin, the assigned MR and their manager can read a Doctor's allocations (a 404 to anyone else).
- **Contract today:** `getDoctor`, `getDoctorLocation`, `isAssignedToDoctor`, `getAssignedUserId`, `listAssignedDoctors`
  (both use the same visibility rule), `getChemistLocation`, `getChemist`, `getProduct`, `getDistributor`, `canActOnDistributor`,
  `getSampleAllocation`, `decrementRemaining`. `getChemistLocation` returns
  `null` for both "no such Chemist" and "no location set", which Field Activity must read as "the
  geofence check cannot run", never as "passed".

## What it owns

- **Doctor** — `route_id`, category, name, address, email, specialty, qualification, and a
  registered `latitude`/`longitude` captured once at creation. Also optional `clinic_name` and `phone` (10–15 digits), and optional `date_of_birth`,
  `anniversary` (`YYYY-MM-DD`) and `visit_frequency` (1–4 visits a month since 2026-10-22, `MAX_VISIT_FREQUENCY` in contracts; null = no target). An MR sets them
  when adding the doctor; Admin edits all of the doctor, and a manager can change only these three for a
  doctor of someone in their downline (`PATCH /doctors/:id/targets`; the assigned MR cannot change their own target).
- **Chemist** — the same shape minus specialty/qualification, its own registered
  `latitude`/`longitude`.
- **Distributor** — attaches at the `route_id` level, same as Doctor/Chemist (client rules
  §17.2). Zone/HQ are resolved through the Route (`TerritoryPublicContract.getRoutePath`),
  never stored. Carries GST number, contact person, mobile, address, a registered
  `latitude`/`longitude`, a list of `route_ids` (one Zone), and a list of `assigned_user_ids` (any field
  employees). Orders, payments and monthly stock counts against it live in Sales & Orders.
- **Product** — the single catalog for both orderable items and sample-eligible items; there is
  no separate sample catalog. `sku` unique.
- **DoctorSampleAllocation** — Admin issues a `quantity_allocated` of a `Product` to a `Doctor`;
  `quantity_remaining` decrements as the field side draws against it (that draw is a Field
  Activity transaction, not owned here — see Dependencies below).
- **DoctorAssignment** — the Doctor↔MR responsibility link, deliberately independent of
  `Doctor.route_id`. A doctor sits on exactly one route (location); who is *responsible* for that
  doctor is this table. **At most one active row per doctor**; older rows are history.

Full fields, types and the ER diagram: [`../erd/03-field-master-data.md`](../erd/03-field-master-data.md).

## Public contract

Following the `.public.ts` pattern (`../engineering/module-anatomy.md` — `health.public.ts` is
the shape example), `FieldMasterDataPublicContract` exposes what other modules actually need to
call, not the full CRUD surface:

| Method (indicative) | Consumer | Why |
|---|---|---|
| `getDoctorLocation(doctorId)` → `{ latitude, longitude } \| null` | Field Activity (Phase 6) | The geofence check compares an MR's captured GPS at call time against this. This module owns *where the doctor is supposed to be*; it does not run the distance check or know the configured radius — that's `SystemConfig.GEO_FENCE_RADIUS_METERS` plus Field Activity's own logic, per `../hld/01-sync-and-geofencing.md`. |
| `getChemistLocation(chemistId)` → same shape | Field Activity | Same split, for Chemist Calls. |
| `getAssignedUserId(doctorId)` → `string \| null` | Field Activity | The MR a Doctor is assigned to now (an active Doctor with an active assignment), so an Admin-created Doctor Service has someone to be tied to. `null` for an unknown, `pending` or inactive Doctor or one with no MR. |
| `isAssignedToDoctor(userId, doctorId)` → `boolean` | Field Activity | Gates who may draw against a `DoctorSampleAllocation` via "Doctor Sample Provided" on a Dr Call, and who Admin-created Doctor Services auto-select (PRD §6.2.B — outside this module, but reads the same assignment table). |
| `listAssignedDoctors(userId)` → `Doctor[]` | Field Activity, Marketing | An MR's "my doctors" list — what a mobile Home-tab screen and a Target scoped to a doctor's assignee both need. |
| `getSampleAllocation(doctorId, productId)` → `DoctorSampleAllocation \| null` and a paired `decrementRemaining(allocationId, qty)` | Field Activity | The sample-given transaction on a Dr Call reads remaining quantity and decrements it; this module owns the row, Field Activity owns the event that triggers the write. |
| `getDoctor(id)` / `getChemist(id)` / `getDistributor(id)` / `getProduct(id)` | Sales & Orders, Marketing | Order line items and Visual/Campaign/Target scoping reference these by id; each consumer resolves the reference through the contract rather than reading the collection directly. |
| `canActOnDistributor(userId, distributorId)` → `boolean` | Sales & Orders | Gates Order/MonthlyStock creation: true if the user is in the Distributor's `assigned_user_ids`, or a `RouteAssignment` covers any of its Routes. Manager access is resolved by the caller through the reporting chain, not here. |

Doctor/Chemist/Distributor/Product **CRUD itself is not exposed to other modules** — it's
Admin-only, reached through this module's own HTTP surface (below), not through the contract.

## Write-path rules & invariants

- **Registered location is captured once, when the Doctor is added** — by the MR's phone (then
  reviewed by Admin at approval) or picked on a Google map by Admin (PRD §5.1: "captured once when
  added"). There is no scheduled re-capture; correcting a wrong location is an explicit Admin edit,
  not something that happens automatically as calls accumulate near a different point.
- **Direct assignment vs. route coverage are two independent relationships, and neither implies
  the other** (visibility does read both — see *Who can see a Doctor*). `RouteAssignment` (Territory module) covering a route does not grant visibility
  into every Doctor/Chemist on it — sample/gift/service actions require the specific
  `DoctorAssignment` row.
- **One active `DoctorAssignment` per Doctor.** Assigning a doctor who already has an active row
  deactivates that row and inserts the new one in the same write. Enforce it with a partial unique
  index on `doctor_id` where `status = active`, not a read-then-write check, so two concurrent
  Admin reassignments can't both leave an active row. The MR's managers get access through the
  reporting chain, not through extra assignment rows.
- **Every id in a Distributor's `assigned_user_ids` must reference an active FIELD-role user**, validated
  via Identity's `isFieldRole`, same check `RouteAssignment` uses.
- **`DoctorSampleAllocation` is Admin-issued master data, not something an MR requests or
  creates.** The MR-side "gave 3 units" event lives in Field Activity as a Dr Call field
  (`Doctor Sample Provided`); this module's job stops at exposing `quantity_remaining` and
  accepting the decrement call from Field Activity's use case.
- **Distributor and Chemist stay separate entities**, per the ERD's own reasoning: Chemist
  carries the Call/Followup transactional flow, Distributor doesn't, so merging them would leave
  unused fields on one side or the other regardless of which way it went.
- **A `quantity_remaining` decrement must never go negative.** Enforced here as a write-path
  invariant even though the triggering event originates in Field Activity — this module owns the
  row and is the last line of defense against a race between two concurrent sample-given writes.

## HTTP surface

All Admin-only (Web Portal, `../roadmap.md` phase 9) unless noted.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/field-master-data/doctors` | Admin | Create a Doctor, including registered lat/lng |
| `GET` | `/field-master-data/doctors` | Admin | List/search, filterable by route, category, status; each row shows who is responsible |
| `POST` | `/field-master-data/doctors/added` | FIELD | An MR adds a Doctor (offline-first, `clientRequestId`); `201` new, `200` for a retry of one already made |
| `PUT` | `/field-master-data/doctors/added/:id` | FIELD | The MR changes a rejected, withdrawn or reopened Doctor — resubmits it |
| `GET` | `/field-master-data/doctors/added` | FIELD | The Doctors I added, any status, each with where it is in its approval |
| `GET` | `/field-master-data/doctors/mine` | FIELD | My Doctors — assigned to me, on Routes I still have (per the switch) |
| `GET` | `/field-master-data/doctors/team` | FIELD (manager) | My downline's Doctors; `userId` narrows to one report |
| `GET` | `/field-master-data/doctors/:id` | Admin, assigned MR, their manager | Detail (404 to anyone else) |
| `PATCH` | `/field-master-data/doctors/:id` | Admin | Edit, including correcting a registered location, also while inactive. `status: inactive` ends the assignment too |
| `PUT` | `/field-master-data/doctors/:id/photo` | Admin | Set or replace the Doctor's photo (multipart `file`) — see *Doctor photo* below |
| `DELETE` | `/field-master-data/doctors/:id/photo` | Admin | Remove it |
| `PUT` | `/field-master-data/doctors/added/:id/photo` | FIELD | The MR who added the Doctor sets or replaces its photo, until the request is approved |
| `DELETE` | `/field-master-data/doctors/added/:id/photo` | FIELD | The same, to remove it |
| `GET` | `/field-master-data/doctors/:id/impact` | Admin | What deactivating or deleting touches (2026-10-22) |
| `DELETE` | `/field-master-data/doctors/:id` | Admin | Delete for good: archived, assignments removed, taken off editable plans (2026-10-22) |
| `POST` | `/field-master-data/doctors/:id/assignments` | Admin | Assign an MR to this Doctor, replacing any current active assignment |
| `GET` | `/field-master-data/doctors/:id/assignments` | Admin | Assignment history, newest first |
| `DELETE` | `/field-master-data/doctors/:id/assignments/:userId` | Admin | Remove a direct assignment |
| `POST` | `/field-master-data/chemists` | Admin | Create a Chemist |
| `GET`/`PATCH` | `/field-master-data/chemists`, `/chemists/:id` | Admin | List/detail/edit |
| `POST` | `/field-master-data/distributors` | Admin | Create a Distributor on a Route (portal picks Zone → HQ → Route using Territory's filtered list endpoints) |
| `GET` | `/field-master-data/distributors` | Admin | List, filterable by `routeId`, `hqId`, `zoneId` (upper levels resolved to route ids via Territory), and `assignedUserId` |
| `GET`/`PATCH` | `/field-master-data/distributors/:id` | Admin | Detail/edit, including reassigning MR/ASM |
| `POST` | `/field-master-data/products` | Admin | Create a Product |
| `GET` | `/field-master-data/products`, `/products/:id` | Admin, Accountant | List/detail (the Accountant for the order form's product picker, 2026-10-24) |
| `PATCH` | `/field-master-data/products/:id` | Admin | Edit |
| `POST` | `/field-master-data/doctors/:id/sample-allocations` | Admin | Issue a Product quantity for a Doctor (adds to an existing allocation) |
| `PATCH` | `/field-master-data/doctors/:id/sample-allocations/:productId` | Admin | Correct the allocated total (not below what was given out) |
| `GET` | `/field-master-data/doctors/:id/sample-allocations` | Admin, assigned MR, their manager | Remaining quantities |

Also usable from the mobile field app: `Add Doctor` (PRD §6.2.A) — `POST /field-master-data/doctors/added`,
with a reduced field set, which goes through approval before the Doctor is usable. See
**Doctor-creation approval** below.

## Doctor-creation approval

Client sign-off C4 (answered 2026-09-24), changed 2026-10-12: a Doctor an MR adds needs approval from **the MR's manager or Admin — either one decides** (the kind is `managerOnly`; no second stage), through the `approval` module ([`approval.md`](approval.md),
[`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md)) — this module
doesn't re-derive the state machine.

- Before deciding, the manager (or Admin) can correct any detail, including the location, with `PATCH /doctors/:id/review` (pending doctors only; a manager outside the MR's upline gets 404). The phone's own point stays in `capturedLocation`. Admin-added doctors need no approval.
- This module registers the `NEW_DOCTOR` kind (final approver `ADMIN`, `managerOnly`) and submits it from the MR's
  create endpoint, in the same transaction as the insert, so a Doctor never exists without its
  request. The approve, reject and withdraw actions are the approval module's own `/api/approvals/*`
  endpoints; Admin opens the Doctor from a request's `recordId`.
- **An MR-added Doctor is `pending` until `APPROVED`.** `Doctor.status` is `pending`, `active` or
  `inactive`. `getDoctor` and `getDoctorLocation` return `null` for a pending Doctor, and
  `isAssignedToDoctor` / `listAssignedDoctors` never include one, so nobody calls on it or gives
  samples to it. It's visible to Admin, to the MR who added it, and to that MR's managers.
- **On `APPROVED`** the Doctor becomes `active` and `approvedAt` is set. With
  `AUTO_ASSIGN_DOCTOR_ON_APPROVAL` on, the MR who added it is assigned in the same transaction —
  unless they're inactive or no longer have the Doctor's Route, in which case the Doctor is left
  unassigned for Admin (the approval never fails for that reason).
- **On `REJECTED` / `WITHDRAWN`** it stays `pending`; the MR can edit it (`PUT /doctors/added/:id`)
  and resubmit as a new cycle on the same request. The MR's edit re-captures the phone location.
- **On Admin `REOPENED`** an approved Doctor goes back to `pending` with `approvedAt` cleared, so it
  drops out of the field's lists while it's reconsidered; its assignment is kept, hidden, and is not
  duplicated when it's approved again.
- **Offline-first create.** An MR adds a Doctor on the phone and it reaches the server with the daily
  report's push as a `NEW_DOCTOR` sync record (`sync.md`), running this same logic inside the sync
  engine's transaction; `POST /doctors/added` stays for an online add. Either way `clientRequestId`
  (the sync client id, unique per MR) makes a retry safe: the same id again
  returns the Doctor already made (`200`, not a second Doctor or request). Two requests racing on
  one id are settled by a unique index — one wins, the others get the winner. The Route must be one
  the MR currently has.
- **Admin review.** Admin can correct the location on a map while the Doctor is pending (or later,
  with the ordinary edit): `location` changes, `capturedLocation` keeps the phone's point. Admin
  can't approve or deactivate a pending Doctor through an edit; that is the approval's job.
- `MANAGER_ONLY` for this kind is a config switch (`APPROVAL_MANAGER_ONLY_KINDS`), not code, if
  the client later decides the Admin stage is too heavy.

**Accepted 2026-09-29** (client sign-off C3, C4, C6, C7, C8; `../decision-log.md`):

- **What an MR fills:** category, name, address, email, specialty, qualification, the Route (one of
  the MR's own) and the location — the phone's GPS when adding. After approval the MR can't change
  it; only Admin can.
- **Admin-created Doctors** pick the location on a Google map and are `active` at once, no approval.
- **`approvedAt`** is stored on the Doctor, for a coverage wait (client sign-off C7) when coverage reporting is built. The
  `NEW_DOCTOR_COVERAGE_WAIT_DAYS` setting was removed on 2026-10-22: nothing read it.

## Who can see a Doctor

- **An MR** sees the Doctors assigned to them, and — while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` (default
  true) is on — only those whose Route is one of their current Routes. Assignments on a Route the MR
  no longer has are hidden when read, not changed, so a Route given back brings them back. With the
  switch off, an MR keeps every assigned Doctor.
- **Assigning needs the Route.** A Doctor can be assigned only to an MR whose Routes include the
  Doctor's Route. Changing an MR's Routes never assigns or unassigns Doctors; Admin assigns the
  Doctors on the new Route by hand.
- **Managers** see the Doctors and Routes of their downline through the reporting chain, by the
  same rule applied to each report.

## Edge cases

- **A Doctor/Chemist with no registered location.** `latitude`/`longitude` may be empty (a
  migrated record). An empty location means the geofence check can't run, so `getDoctorLocation` returning
  `null` must mean "geofence check cannot run" to Field Activity, not "check passed" — this
  module's contract should make that distinction unambiguous in its return type rather than
  leaving Field Activity to infer it from a missing field.
- **A Distributor's assigned person is later deactivated or moved.** Nothing
  cascades automatically (same as Identity's `manager_id`); the Distributor stays visible through
  Route coverage and to managers, and Admin reassigns it. A list filter for "Distributors whose
  assigned MR is inactive" is the likely admin tool, not an automatic rewrite.
- **An MR assigned to a Doctor both directly and via the Doctor's route being covered by that
  MR's `RouteAssignment`.** No conflict — direct assignment is a superset grant for
  sample/gift/service visibility; route coverage alone (without direct assignment) does not grant
  that, per the ERD's explicit call-out. `isAssignedToDoctor` answers only the direct-assignment
  question.
- **A sample-given event racing a second one against the same allocation.** The
  never-goes-negative invariant must be enforced atomically at the data layer (a conditional
  update, not read-then-write in application code), or two concurrent Dr Calls can both succeed
  against a `quantity_remaining` of 1.
- **Deactivating a Doctor (`status: inactive`) with an active `DoctorAssignment`** ends the assignment in the same
  transaction (2026-10-22; it used to be refused until Admin removed it). `DoctorSampleAllocation` rows stay as history.
- **A Product referenced by an allocation being edited or deactivated.** `quantity_allocated`/
  `quantity_remaining` should stay meaningful even if the Product's name/SKU changes later — this
  argues for the allocation storing a reference, not a denormalized snapshot, since (unlike
  Payroll's `base_salary` snapshot) there's no PRD requirement that historical allocations stay
  frozen against catalog edits.

## Dependencies

- **Identity** (Tier 1) — `User` ids for `DoctorSampleAllocation.allocated_by` and
  `DoctorAssignment.user_id`.
- **Territory** (Tier 2) — `Route.id` for Doctor/Chemist/Distributor, `getRoutePath` for the Zone/HQ breadcrumb; `RouteAssignment`
  is read (not written) here only insofar as the "route coverage ≠ direct assignment" distinction
  needs Territory's contract to explain the difference in documentation and, likely, in a combined
  "who can see this doctor" query on the Field Activity side rather than in this module.
- **Approval** (Tier 2, [`approval.md`](approval.md)) — the `NEW_DOCTOR` workflow for MR-created
  Doctors: `registerKind`, `submit`, `getForRecord`.

Consumed by (Tier 4, `../roadmap.md` phase 6): Field Activity, Sales & Orders, Marketing — see
Public contract above.

## Deliberately deferred

- **The geofence distance check and its radius config** — owned by Field Activity and
  `SystemConfig` respectively, not this module. See `../hld/01-sync-and-geofencing.md`.
- **How the Doctor's approval date enters the coverage figure** — Field Activity (Phase 6).
- **DoctorGift** — despite being Admin-issued the same way `DoctorSampleAllocation` is, the ERD
  places it in Module 4 (Field Activity) alongside DoctorService, not here. Don't duplicate it in
  this module.
- **Bulk import** (e.g. a CSV of Doctors) — nothing in the PRD asks for it; add only if a real
  onboarding need shows up.


## Product details (2026-10-06)

A `Product` is the pharma catalog card: **brand** (`name`, e.g. XYZ-500), `sku`, **therapeutic class** (`category`), `composition`, `type` (a list:
Tablet, Capsule, Syrup, Suspension, Injection, Ointment, Cream / gel, Drops, Powder / sachet, Inhaler, Other), `packSize` (as printed, e.g. `10×10`),
`ptsPaise`, `ptrPaise`, `mrpPaise`, `gstPercent` (a list: 5, 12, 18, 28), optional `division`, and `status`. Prices are whole paise and must satisfy
PTS ≤ PTR ≤ MRP (checked on create, and on an edit against the prices as they will stand); equal is allowed. Everything but `division` is required on create. A product
saved before these existed has them `null` and can still be edited (renamed, deactivated) without them; it shows `—` for them until someone completes it. The phone's
product cache carries all of them. `category` keeps its stored name and now means the therapeutic class.

**HSN/SAC (2026-10-28):** `hsn`, 4 to 8 digits, required on create and on an edit of a product that already has one; an older product without one may be saved without it, but cannot be delivered on an order until it has one. It is copied onto the order line when the order is marked Done. The phone's product cache does not carry it.


## Speciality list, and no doctor category (2026-10-06)

A `Doctor` no longer has a category. Its `specialty` is the name of an entry in the Admin-kept `Specialty` list (name, status; no rank).
`GET/POST/PATCH /api/field-master-data/specialties` (Admin). A doctor created or edited by Admin, or added by an MR (including offline, through the
`NEW_DOCTOR` sync record), must name an **active** speciality, compared ignoring case and stored in the list's spelling; anything else is a 400
`specialty` ("Choose a speciality from the list"). A doctor's speciality that is left as it was is not re-checked, so an older doctor whose free text is
not on the list can still be edited. **Renaming** a speciality also renames it on its doctors; **deactivating** only stops it being offered. The phone's
snapshot carries `specialties` (the active names, A–Z) for the dropdown, and the doctor payloads no longer carry `category`; an old phone sending one has
it ignored. `migrate:specialties` builds the list from a starter set plus the existing doctors' specialities.


Adding a doctor on the web is three steps (**Details → Location → Review**) in the same shell as the employee wizard (centred card, `Stepper`, Back/Next footer); editing one still shows Details and Location on one page. "Next" checks only that step's fields, and errors show only after Next has been pressed on the step (Next is a submit button, so Enter in a field also means Next); only the review step creates the doctor. Location is optional, and its latitude/longitude fields are behind "Enter coordinates". The responsible MR is chosen on the doctor's page afterwards.

## Distributor and chemist forms (2026-10-09)

Adding a chemist (Details, Location, Review) and a distributor (Details, Coverage, Location, Review) uses the employee wizard's shell (`WizardShell`); Coverage is the zone (with "Add zone"), the routes of that zone, and the assigned people. A distributor's page is tabs: **Details** (the edit form), **Payments** and **Orders** (see LLD sales-and-orders.md, *Distributor payments*). Existing distributors were moved to the new shape by `pnpm --filter @greynote/api migrate:distributors` (dry run, then `-- --apply`).

## Accountant adds and edits distributors (2026-10-14)

`POST` and `PATCH /api/field-master-data/distributors` are ACCOUNTANT/ADMIN; chemists are readable by the Accountant (the add-order picker). The Accountant's pickers read zone, HQ and route *lists* (`GET /api/territory/zones|hqs|routes`) and `GET /api/identity/work-with/directory` (active field employees: id, code, name, designation); everything else in Territory and the employee records stay Admin/HR. The old payments-only distributor screens for the Accountant are gone: both roles use the same list and page (Details, Payments, Orders, Stock).

## Opening dues (2026-10-14)

`Distributor.openingDuesPaise` (whole paise, default 0, set on create and PATCH by Admin/Accountant). Dues = opening + Done orders delivered − recorded payments (see sales-and-orders.md). `listDistributorAssignees()` on the public contract gives Reports each active distributor's assigned employees.

## Taking a doctor out of service: edit, deactivate, delete (decision-log 2026-10-22)

Admin only, on the web. `application/doctorRetirement.ts`.

- **Impact first.** `GET /doctors/:id/impact` → `DoctorImpactDto`: the assigned MR, Daily Plans from today that list it (`editable` / `locked`), calls ever made, open gifts (`PENDING`) and services (not done), sample allocations and the units left, visuals picked. What other modules hold is counted through their contracts (`planning.countPlansWithDoctor`, `fieldActivity.countDoctorRecords`, `marketing.countDoctorVisuals`), bound by the composition root (`fieldMasterData.bindDoctorReferences`) since they sit above or beside this module. A warning, never a block. A `pending` doctor is `409`: the approval decides it.
- **Edit** is unchanged, and also allowed on an inactive doctor (the web no longer locks the form).
- **Deactivate** (`PATCH status: inactive`) saves the status and ends the active assignment in one transaction.
- **Delete** (`DELETE /doctors/:id`) runs in one transaction: the stored row is copied to `doctorarchives` (with the last MR, who deleted it and when), its `DoctorAssignment` rows are removed, then the doctor. Calls, gifts, services, sample allocations, visual picks and plans are **not** touched. The contract's `getDoctor` falls back to the archive and answers `inactive`, so history (DCRs, gift and service lists, reports) keeps the name and every new write refuses it; Admin's own `GET /doctors/:id` is `404`.
- **Plans follow.** Whenever an MR loses a doctor (unassigned, replaced by another MR) or the doctor is deactivated or deleted, Planning's `releaseDoctor` takes it off the Daily Plans **from today on that are still editable** (no request, or rejected / withdrawn / reopened): that MR's, or everyone's for a deactivate or delete. Submitted and approved plans keep it (a call on it is refused). Before this, the next submit of such a plan was refused ("isn't one of your doctors"). A failed clean-up is logged and doesn't undo the change. Missed-call carry-over already drops doctors the MR no longer has.
- **Web table rows:** the Doctors list's "⋯" menu offers Edit, Deactivate / Reactivate and Delete… on active and inactive rows (Deactivate and Delete go through the impact dialog). A pending row offers only *Review details* and *Approve or reject*, which opens its own request: each doctor in the API carries `approvalRequestId` (the NEW_DOCTOR request while it is pending, else `null`).
- **Not here:** MR or manager requests from the phone; closing open gifts or services (the impact lists them).

## Doctor photo (2026-10-23)

An optional `Doctor.photo {url, publicId}` (default `null`; no migration, existing doctors read as none). Clients get only `photoUrl` (`DoctorDto`, the sync snapshot's `doctors` and `pendingDoctors`); `DoctorViews` strips the storage id. Uses the same pieces as the employee photo (now in `shared/`: `photoUpload.middleware`, `photoFile`, `photoStorage.port`, `CloudinaryPhotoStorage`): JPG, PNG or WebP by first bytes, up to 5 MB, 512×512, stored at `greynote/doctors/{id}/photo`.

- **Separate from the add.** The add (`POST /doctors`, `POST /doctors/added`, the `NEW_DOCTOR` sync record) stays JSON, since the phone is offline-first and has no doctor id yet. The photo is uploaded afterwards (`SetDoctorPhotoUseCase`). The web wizard holds the file and uploads it right after the create; if that fails the doctor still exists and its page opens, where the photo can be added again.
- **Who.** Admin: any doctor. FIELD: only a doctor they added (`clientRequestId` set), and only while its `NEW_DOCTOR` request is not `APPROVED`; otherwise `404` (someone else's) or `409` (approved). It is not part of the approval, so changing it never resubmits.
- **Storage hygiene.** Set stores the new file, saves, then deletes the old one (and deletes the new one if the save fails). Remove deletes the file first, then clears the record. Deleting a doctor deletes its file; the archive keeps no photo (history needs the name).
- **Web.** An optional picker at the top of the doctor form (add and edit; hidden in the approvals review), an avatar (initials when none) in the Doctors table, and the photo in the approval preview.
