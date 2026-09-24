# Territory

The spatial hierarchy field operations are organized against — `Zone → HQ → Area → Route` — and the
mechanism that turns a route into a travel-allowance figure: an admin-drawn sequence of waypoints
resolved into a real road distance. PRD §5.1; full entity model in
[`../erd/02-territory-master.md`](../erd/02-territory-master.md); the distance algorithm in full
in [`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md).

## What it owns

- **`Zone`** — top of the hierarchy (e.g. West Bengal Zone). Name only at this tier; nothing
  spatial is stored on it directly.
- **`HQ`** — belongs to one `Zone`. A headquarters grouping (e.g. Siliguri HQ).
- **`Area`** — belongs to one `HQ` (e.g. Matigara, Fulbari, Sevoke under Siliguri HQ). Carries a
  `type`: `HQ` | `EX_STATION` | `OUT_STATION`, which decides which of a grade's DA rates applies
  to a day worked there (HLD 06 §2).
- **`Route`** — belongs to one `Area`. An ordered sequence of geocoded waypoints
  (`{label, latitude, longitude, place_id}`), a computed road distance (`distance_km`), and that
  distance's provenance/status (`distance_source`: `AUTO_CALCULATED` | `MANUAL_OVERRIDE`;
  `distance_status`: `CALCULATED` | `FAILED`; `distance_calculated_at`; `revision`).
  Always uses its Area's `type` — no per-Route override (client sign-off D5).
- **`RouteAssignment`** — the MR ↔ `Route` join. Many-to-many: a route can have several MRs
  (shared coverage), an MR can cover several routes. Carries `assigned_at` and `status`
  (`active`/`inactive`) as a lightweight assignment history, rather than a single FK that
  silently loses history on reassignment.

Full field list: [`../erd/02-territory-master.md`](../erd/02-territory-master.md).

**Explicitly not owned here.** PRD §5.1 also describes Admin "attaching Doctors/Chemists to
routes" (client rules §17.2 add Distributors) and directly assigning MRs to specific Doctors —
those joins belong to Field Master Data (ERD Module 3), deferred there because
`Doctor`/`Chemist`/`Distributor` don't exist as entities yet at this tier. Territory's own
`RouteAssignment` is MR ↔ Route only.

**No per-designation territory scope.** Managers (ASM/RSM/ZSM/NSM) are not assigned to an
Area/HQ/Zone here. Client rules §18 define manager visibility purely by reporting chain, which
Identity's `manager_id` + `getDownline` (HLD 05 §3) already covers, whatever a manager's
geography is and however many levels an org actually has.

## Public contract

Following the pattern in
[`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) — `TerritoryPublicContract`
is the only thing another module may import, shaped like `health.public.ts`'s
`HealthPublicContract` but with real read methods instead of one `report()`:

```ts
interface TerritoryPublicContract {
  getRoute(routeId: string): Promise<RouteSummary | null>;
  listRoutesForUser(userId: string): Promise<RouteSummary[]>;  // active assignments, active routes
  getRoutePath(routeId: string): Promise<RoutePath | null>;
}

// No waypoints — consumers need the TA/DA inputs, not the geometry.
interface RouteSummary {
  id: string; name: string; areaId: string; areaName: string;
  areaType: AreaType;                  // decides DA
  distanceKm: string | null;           // null exactly when distanceStatus is FAILED; never doubled
  distanceStatus: 'CALCULATED' | 'FAILED';
  taPerKmRateOverride: string | null;
  status: 'active' | 'inactive';
}
interface RoutePath { routeId: string; areaId: string; areaType: AreaType; hqId: string; zoneId: string }
```

The planned separate `getRouteDistance` was folded into `getRoute`: `RouteSummary` already
carries the distance, its status and the TA rate override, so a second method would only mean a
second round trip for Field Activity.

Consumers, per [`../roadmap.md`](../roadmap.md):

- **Field Master Data** (Tier 3) — a `Doctor`/`Chemist`/`Distributor`'s territory attachment
  needs to validate a `Route` id exists, and list screens resolve its Area/HQ/Zone breadcrumb via
  `getRoutePath`.
- **Planning** (Tier 3) — a Daily Plan's route selection (PRD §6.2.A) reads `listRoutesForUser`
  to offer only routes the submitting MR is actually assigned.
- **Field Activity** (Tier 4) — TA/DA auto-calculation
  ([`../hld/06-ta-da-auto-calculation.md`](../hld/06-ta-da-auto-calculation.md)) reads
  `getRoute` for TA (`distanceKm`, `taPerKmRateOverride`), and must handle a `FAILED` status as a
  flag, not a silent zero (see Edge cases below). `areaType` on the same summary gives DA.

Territory itself depends only on Identity (Tier 1) — a `RouteAssignment.user_id` is validated
through `IdentityPublicContract.findUserSummary` (the user must exist, be `FIELD`, and not be
`inactive`; a `pending` user still onboarding can be assigned), never against `identity`'s
Mongoose model directly.

## Write-path rules & invariants

- **A `Route` always belongs to exactly one `Area`, which belongs to exactly one `HQ`, which
  belongs to exactly one `Zone`.** No orphaned routes; creating a `Route` requires a valid
  `area_id`, and creating an `Area` requires a valid `hq_id` and a `type`.
- **Waypoints are entered as resolved points, never raw text.** Per HLD 02 §1, Admin searches a
  Geocoding/Places API and confirms a pin on a map preview; what gets stored is
  `{label, latitude, longitude, place_id}`, not the typed string. A waypoint with no confirmed
  coordinates cannot be added to a route.
- **A `Route` may save before its distance resolves.** Master-data entry is never blocked on an
  external API being up — a route with `distance_status: FAILED` (the Directions call errored
  or timed out, ~5 s) is a valid, saved `Route`. Admin retries with `POST
  /routes/:id/recalculate`. See Edge cases.
- **At most 25 waypoints per Route** (origin + destination + 23 via) — Google Directions' limit
  for one request.
- **Names are unique within their parent**, case-insensitive: Zone globally, HQ per Zone, Area
  per HQ, Route per Area.
- **Nothing is hard-deleted.** A Zone/HQ/Area can't be deactivated while it has an active child;
  a Route can't be deactivated while it has an active `RouteAssignment`.
  Nothing can be created or reactivated under an inactive parent. A node's parent can't be
  changed (no reparenting; see Deliberately deferred).
- **`distance_km` is used as-is for TA — never doubled for a return trip.** Admin enters the
  route (or overrides the distance) to cover the full paid travel (decision-log 2026-09-24).
- **Distance is recalculated, not frozen, on every waypoint edit.** Any add/remove/reorder of a
  waypoint immediately triggers a fresh Directions-API call (blocking — the web portal is not
  offline-first, so this is acceptable at save time) and resets `distance_source` back to
  `AUTO_CALCULATED`, overwriting any prior manual override. A route's distance therefore always
  reflects the route's *current* geography — never a stale figure left over from before an edit.
- **Admin may manually override the calculated distance directly**, setting
  `distance_source: MANUAL_OVERRIDE`. This exists because real money (TA) moves on this number,
  and an inaccurate auto-calculated figure shouldn't be locked in until someone notices. The
  override does **not** survive the next waypoint edit — see above.
- **The Directions call preserves waypoint order and never lets the provider re-optimize it.**
  "Via Medical More via Darj" is a meaningful, real sequence for TA purposes, not a routing
  problem to solve efficiently.
- **Distance is a real road distance, not straight-line/Haversine** — consistent with TA being a
  reimbursement figure, not an estimate.
- **`RouteAssignment` is additive, never a silent overwrite.** Reassigning or deactivating an
  MR's coverage of a route changes a `RouteAssignment` row's `status`; it does not delete or
  overwrite prior assignment history.

## Route-distance integration

Google Maps Platform's current APIs (new projects can no longer enable the legacy Directions /
Places APIs), behind two ports so swapping providers is one adapter (decision-log 2026-09-24):

- `PlaceSearchPort` → **Places API (New)** Text Search, India-biased, 10 candidates; one call
  returns coordinates, so no separate Place Details lookup.
- `DistanceProviderPort` → **Routes API** `computeRoutes`, `DRIVE`, `optimizeWaypointOrder:
  false`, field mask `routes.distanceMeters` (cheapest SKU). Never throws: any failure (HTTP
  error, no drivable route, 5 s timeout) is logged and the route is saved `FAILED`.

Needs `GOOGLE_MAPS_API_KEY` with both APIs enabled; without it the API boots, place search
returns `503 SERVICE_UNAVAILABLE`, and routes save as `FAILED`. Unit tests use a fake provider.

Full sequence diagrams and failure-handling rationale:
[`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md). Summary at
this module's depth:

1. Admin types a waypoint label → Geocoding/Places autocomplete → candidates shown as pins on a
   map preview → Admin confirms one → `{label, latitude, longitude, place_id}` stored. Repeats
   per waypoint, in order.
2. On Route save, the ordered waypoint coordinates go to a Directions API (order preserved, no
   re-optimization) → total road distance comes back → `distance_km`, `distance_source:
   AUTO_CALCULATED`, `distance_status: CALCULATED` are written together.
3. A later waypoint edit re-runs step 2 automatically. A direct edit to `distance_km` instead
   sets `distance_source: MANUAL_OVERRIDE` and leaves waypoints untouched.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/territory/zones` | Admin | Create a Zone |
| `GET` | `/api/territory/zones` | Admin | List Zones |
| `POST` | `/api/territory/hqs` | Admin | Create an HQ under a Zone |
| `GET` | `/api/territory/hqs` | Admin | List HQs, optionally filtered by Zone |
| `POST` | `/api/territory/areas` | Admin | Create an Area (with `type`) under an HQ |
| `GET` | `/api/territory/areas` | Admin | List Areas, optionally filtered by HQ and `type` |
| `PATCH` | `/api/territory/areas/:id` | Admin | Edit an Area's name, `type` or status |
| `POST` | `/api/territory/routes` | Admin | Create a Route under an Area — triggers waypoint geocoding + distance calculation |
| `GET` | `/api/territory/routes` | Admin | List Routes, optionally filtered by Area or HQ |
| `GET` | `/api/territory/routes/:id` | Admin | Route detail, including current `distance_status` (an MR sees their routes via `my-routes`; manager views of a downline's routes come with the Team tab) |
| `PATCH` | `/api/territory/routes/:id/waypoints` | Admin | Edit waypoints — re-triggers distance recalculation |
| `PATCH` | `/api/territory/routes/:id/distance` | Admin | Manually override `distance_km` |
| `POST` | `/api/territory/routes/:id/assignments` | Admin | Assign a FIELD employee to this Route |
| `GET` | `/api/territory/routes/:id/assignments` | Admin | Who covers this Route, with employee code/name; full history unless `?status=` |
| `DELETE` | `/api/territory/routes/:id/assignments/:userId` | Admin | End an employee's assignment — the row becomes `inactive` history, not deleted |
| `POST` | `/api/territory/routes/:id/recalculate` | Admin | Retry the Directions call (e.g. after `FAILED`); resets any manual override like a waypoint edit |
| `PATCH` | `/api/territory/zones/:id`, `/hqs/:id`, `/routes/:id` | Admin | Rename, deactivate/reactivate (and Route's `ta_per_km_rate_override`) |
| `GET` | `/api/territory/places/search?q=` | Admin | Proxy to Google Places — candidates with `{label, latitude, longitude, place_id}`; the API key never leaves the server |
| `POST` | `/api/territory/import` | Admin | CSV bulk import of Zone / HQ / Area rows (not Routes — waypoints need confirmed pins) |
| `GET` | `/api/territory/my-routes` | FIELD roles | The calling MR's own assigned Routes — consumed by Planning's route picker |

## Edge cases

- **Geocoding fails for a waypoint, or the Directions call errors/times out.** The `Route` still
  saves (master-data entry is never blocked on an external dependency); `distance_status` stays
  `FAILED` and `distance_km` stays null. Anything downstream — TA auto-calculation
  specifically — must check this status and **flag** it rather than silently treat a null
  distance as zero. This is the one failure mode every consumer of `getRouteDistance` must
  handle explicitly.
- **Two Admins edit the same Route at once, or an edit races a slow recalculation.** Every write
  that changes waypoints or distance (waypoint edit, recalculate, override) is conditional on the
  `revision` it started from and bumps it. A waypoint edit sends the `revision` the Admin's screen
  showed; recalculate and override use the one read at the start of the request. A stale revision
  gets `409 Conflict` (with `currentRevision`) instead of silently overwriting the newer write.
  Rename, status and the TA rate override don't touch distance and aren't revision-checked.
- **An MR is assigned to overlapping or geographically nonsensical routes.** Nothing in the ERD
  or PRD constrains this — shared coverage is explicitly allowed ("a route may have more than one
  MR assigned"), and Territory has no reason to reject it.
- **An Area's `type` is edited after DA has already been generated for days worked there.** Past
  `AUTO` DA `Expense` rows stay as generated (the locked-snapshot rule in HLD 06 §3); only future
  approvals use the new type.
- **A Route's `Area` (or an Area's `HQ`, or an `HQ`'s `Zone`) is reassigned after children already exist under it.**
  Not addressed by the ERD; treat as deliberately deferred (see below) rather than inventing a
  cascade/reparenting rule that isn't asked for.
- **Manual override, then the same admin "re-saves" waypoints unchanged.** Per the ERD's `status`
  semantics, *any* waypoint write resets to `AUTO_CALCULATED` — there's no distinction between an
  edit that changed geography and a no-op re-save. Accepted as-is; the ERD doesn't ask for one.

## Dependencies

- **Identity (Tier 1)** — validates `RouteAssignment.user_id` via `IdentityPublicContract`.
  Nothing else; Territory does not depend on any Tier 3+ module.

## Deliberately deferred

- **Doctor/Chemist/Distributor ↔ Route attachment.** PRD §5.1 describes it; the ERD explicitly
  defers it to Field Master Data (Module 3) because those entities don't exist yet at this tier.
  Do not add this join to Territory when Module 3 lands — it belongs on the other side.
  *(`docs/roadmap.md`'s Phase 2 "done when" line currently reads "Admin can assign … Routes to a
  Doctor/Chemist's covering territory," which is this module's Phase 3-onward dependent, not
  something Territory itself does — worth correcting there to avoid implying this module owns
  that join.)*
- **Route geometry / map rendering.** Waypoints are stored as an ordered array of points, not
  normalized into their own table, because nothing yet needs to render the route on a map (only
  the distance matters). Revisit if that need appears.
- **A `Zone`/`HQ` reparenting or cascade-delete design.** Not specified by the ERD; don't invent
  one preemptively.
