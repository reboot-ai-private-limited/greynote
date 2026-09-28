# Field Master Data

The catalog of who and what a field call is actually about: Doctors, Chemists, Distributors and
Products, plus the two allocation/assignment relationships that decide who may act on a given
Doctor. ERD: [`../erd/03-field-master-data.md`](../erd/03-field-master-data.md). PRD: §5.1
(Route & Territory Master's "Assignments"/"Location Verification" subsections) and §6.2.A
(Doctor Samples). Tier 3 in `apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS`, module folder
`field-master-data`. Roadmap: [`../roadmap.md`](../roadmap.md) phase 4, alongside Planning and HR
— same tier, parallelizable.

## What it owns

- **Doctor** — `route_id`, category, name, address, email, specialty, qualification, and a
  registered `latitude`/`longitude` captured once at creation.
- **Chemist** — the same shape minus specialty/qualification, its own registered
  `latitude`/`longitude`.
- **Distributor** — attaches at the `route_id` level, same as Doctor/Chemist (client rules
  §17.2). Zone/HQ/Area are resolved through the Route (`TerritoryPublicContract.getRoutePath`),
  never stored. Carries GST number, contact person, mobile, address, a registered
  `latitude`/`longitude`, single-value `assigned_mr_id`/`assigned_asm_id`, and
  `primary_sales_enabled`/`secondary_sales_enabled` flags (client Master spec M6). Orders and
  monthly stock counts against it live in Sales & Orders.
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
| `isAssignedToDoctor(userId, doctorId)` → `boolean` | Field Activity | Gates who may draw against a `DoctorSampleAllocation` via "Doctor Sample Provided" on a Dr Call, and who Admin-created Doctor Services auto-select (PRD §6.2.B — outside this module, but reads the same assignment table). |
| `listAssignedDoctors(userId)` → `Doctor[]` | Field Activity, Marketing | An MR's "my doctors" list — what a mobile Home-tab screen and a Target scoped to a doctor's assignee both need. |
| `getSampleAllocation(doctorId, productId)` → `DoctorSampleAllocation \| null` and a paired `decrementRemaining(allocationId, qty)` | Field Activity | The sample-given transaction on a Dr Call reads remaining quantity and decrements it; this module owns the row, Field Activity owns the event that triggers the write. |
| `getDoctor(id)` / `getChemist(id)` / `getDistributor(id)` / `getProduct(id)` | Sales & Orders, Marketing | Order line items and Visual/Campaign/Target scoping reference these by id; each consumer resolves the reference through the contract rather than reading the collection directly. |
| `canActOnDistributor(userId, distributorId)` → `boolean` | Sales & Orders | Gates Order/MonthlyStock creation: true if the user is the Distributor's `assigned_mr_id`, or a `RouteAssignment` covers its Route. Manager access is resolved by the caller through the reporting chain, not here. |

Doctor/Chemist/Distributor/Product **CRUD itself is not exposed to other modules** — it's
Admin-only, reached through this module's own HTTP surface (below), not through the contract.

## Write-path rules & invariants

- **Registered location is captured once, at creation, from the Admin form** — PRD §5.1 says so
  explicitly ("captured once when added"). There is no scheduled re-capture; correcting a wrong
  location is an explicit edit, not something that happens automatically as calls accumulate
  near a different point.
- **Direct assignment vs. route coverage are two independent relationships, and neither implies
  the other.** `RouteAssignment` (Territory module) covering a route does not grant visibility
  into every Doctor/Chemist on it — sample/gift/service actions require the specific
  `DoctorAssignment` row.
- **One active `DoctorAssignment` per Doctor.** Assigning a doctor who already has an active row
  deactivates that row and inserts the new one in the same write. Enforce it with a partial unique
  index on `doctor_id` where `status = active`, not a read-then-write check, so two concurrent
  Admin reassignments can't both leave an active row. The MR's managers get access through the
  reporting chain, not through extra assignment rows.
- **Distributor `assigned_mr_id`/`assigned_asm_id` must reference a FIELD-role user**, validated
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
| `GET` | `/field-master-data/doctors` | Admin | List/search, filterable by route |
| `GET` | `/field-master-data/doctors/:id` | Admin, assigned MR | Detail |
| `PATCH` | `/field-master-data/doctors/:id` | Admin | Edit, including correcting a registered location |
| `POST` | `/field-master-data/doctors/:id/assignments` | Admin | Assign an MR to this Doctor, replacing any current active assignment |
| `DELETE` | `/field-master-data/doctors/:id/assignments/:userId` | Admin | Remove a direct assignment |
| `POST` | `/field-master-data/chemists` | Admin | Create a Chemist |
| `GET`/`PATCH` | `/field-master-data/chemists`, `/chemists/:id` | Admin | List/detail/edit |
| `POST` | `/field-master-data/distributors` | Admin | Create a Distributor on a Route (portal picks Zone → HQ → Area → Route using Territory's filtered list endpoints) |
| `GET` | `/field-master-data/distributors` | Admin | List, filterable by `routeId`, `areaId`, `hqId`, `zoneId` (upper levels resolved to route ids via Territory), and `assignedMrId` |
| `GET`/`PATCH` | `/field-master-data/distributors/:id` | Admin | Detail/edit, including reassigning MR/ASM |
| `POST` | `/field-master-data/products` | Admin | Create a Product |
| `GET`/`PATCH` | `/field-master-data/products`, `/products/:id` | Admin | List/detail/edit |
| `POST` | `/field-master-data/doctors/:id/sample-allocations` | Admin | Allocate a Product quantity to a Doctor |
| `GET` | `/field-master-data/doctors/:id/sample-allocations` | Admin, assigned MR | Remaining quantities |

Also usable from the mobile field app: `Add Doctor` (PRD §6.2.A) — an MR-initiated `POST
/field-master-data/doctors` with a reduced field set, which goes through approval before the
Doctor is usable. See **Doctor-creation approval** below.

## Doctor-creation approval

Client sign-off C4 (answered 2026-09-24): a Doctor an MR adds needs approval **Employee →
Manager → Admin**, through the `approval` module ([`approval.md`](approval.md),
[`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md)) — this module
doesn't re-derive the state machine.

- This module registers a kind (working name `NEW_DOCTOR`, final approver `ADMIN`) and calls
  `approval.contract.submit({ kind, recordId: doctorId, submitterId })` from the MR's create
  endpoint, in the same transaction as the insert.
- **An MR-created Doctor isn't usable until `APPROVED`.** It needs a status outside `active` —
  `Doctor.status` gains `pending` (ERD 03 lists only `active`/`inactive` today; add it when this
  is built). Every contract read above (`getDoctorLocation`, `listAssignedDoctors`,
  `isAssignedToDoctor`, …) treats a `pending` Doctor as not existing yet, so nobody calls on or
  gives samples to an unapproved Doctor.
- `onStatusChange` on `APPROVED` sets the Doctor `active`, in the approval's transaction. On
  `REJECTED` / `WITHDRAWN` it stays `pending`; the MR can edit it (`isEditableBySubmitter`) and
  resubmit, as a new cycle on the same request.
- **Admin-created Doctors skip approval** and are created `active` — Admin is the final approver
  anyway.
- `MANAGER_ONLY` for this kind is a config switch (`APPROVAL_MANAGER_ONLY_KINDS`), not code, if
  the client later decides the Admin stage is too heavy.

**Still open before building it** (client sign-off):

- **C4 (second half):** which fields the MR may fill. Working assumption until answered: category,
  name, address, email, specialty, qualification — no location.
- **C6:** whether the MR captures the Doctor's location on the first visit (approved by ASM/Admin)
  or Admin enters it at creation. Today's assumption is Admin at creation, so an MR-created Doctor
  starts with no registered location — see the no-location edge case below.
- Whether approval also creates a `DoctorAssignment` to the MR who added the Doctor, or Admin
  assigns separately. Decide in Phase 4 and record it in `../decision-log.md`.

## Edge cases

- **A Doctor/Chemist created (or migrated) with no registered location.** `latitude`/`longitude`
  are on the ERD without a stated nullability. If they can be null, `getDoctorLocation` returning
  `null` must mean "geofence check cannot run" to Field Activity, not "check passed" — this
  module's contract should make that distinction unambiguous in its return type rather than
  leaving Field Activity to infer it from a missing field.
- **A Distributor's `assigned_mr_id` points at an MR who is later deactivated or moved.** Nothing
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
- **Deactivating a Doctor (`status: inactive`) with active `DoctorAssignment` or
  `DoctorSampleAllocation` rows.** Decide at implementation time whether deactivation blocks,
  cascades, or leaves them — not specified in the ERD; note the choice in
  `../decision-log.md` when made, the same way Territory's Route deactivation should.
- **A Product referenced by an allocation being edited or deactivated.** `quantity_allocated`/
  `quantity_remaining` should stay meaningful even if the Product's name/SKU changes later — this
  argues for the allocation storing a reference, not a denormalized snapshot, since (unlike
  Payroll's `base_salary` snapshot) there's no PRD requirement that historical allocations stay
  frozen against catalog edits.

## Dependencies

- **Identity** (Tier 1) — `User` ids for `DoctorSampleAllocation.allocated_by` and
  `DoctorAssignment.user_id`.
- **Territory** (Tier 2) — `Route.id` for Doctor/Chemist/Distributor, `getRoutePath` for the Zone/HQ/Area breadcrumb; `RouteAssignment`
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
- **The MR-facing reduced-field "Add Doctor" endpoint's exact field set** — waits on client
  sign-off C4/C6 (see Doctor-creation approval above); the approval flow itself is settled.
- **DoctorGift** — despite being Admin-issued the same way `DoctorSampleAllocation` is, the ERD
  places it in Module 4 (Field Activity) alongside DoctorService, not here. Don't duplicate it in
  this module.
- **Bulk import** (e.g. a CSV of Doctors) — nothing in the PRD asks for it; add only if a real
  onboarding need shows up.
