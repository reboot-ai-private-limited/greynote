# Territory

The spatial hierarchy field operations are organized against — `Zone → HQ → Route` — and the
mechanism that turns a route into a travel-allowance figure: an admin-drawn sequence of waypoints
resolved into a real road distance. PRD §5.1; full entity model in
[`../erd/02-territory-master.md`](../erd/02-territory-master.md); the distance algorithm in full
in [`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md).

## What it owns

- **`Zone`** — top of the hierarchy (e.g. West Bengal Zone). Name only at this tier; nothing
  spatial is stored on it directly.
- **`HQ`** — belongs to one `Zone`. A headquarters grouping (e.g. Siliguri HQ).
- **`Route`** — belongs to one `HQ`. An ordered sequence of geocoded waypoints
  (`{label, latitude, longitude, place_id}`), a computed road distance (`distance_km`), and that
  distance's provenance/status (`distance_source`: `AUTO_CALCULATED` | `MANUAL_OVERRIDE`;
  `distance_status`: `PENDING` | `CALCULATED` | `FAILED`; `distance_calculated_at`).
- **`RouteAssignment`** — the MR ↔ `Route` join. Many-to-many: a route can have several MRs
  (shared coverage), an MR can cover several routes. Carries `assigned_at` and `status`
  (`active`/`inactive`) as a lightweight assignment history, rather than a single FK that
  silently loses history on reassignment.

Full field list: [`../erd/02-territory-master.md`](../erd/02-territory-master.md).

**Explicitly not owned here.** PRD §5.1 also describes Admin "attaching Doctors/Chemists to
routes" and directly assigning MRs to specific Doctors — both of those joins belong to Field
Master Data (ERD Module 3), deferred there because `Doctor`/`Chemist` don't exist as entities
yet at this tier. Territory's own `RouteAssignment` is MR ↔ Route only.

## Public contract

Following the pattern in
[`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) — `TerritoryPublicContract`
is the only thing another module may import, shaped like `health.public.ts`'s
`HealthPublicContract` but with real read methods instead of one `report()`:

```ts
interface TerritoryPublicContract {
  getRoute(routeId: string): Promise<RouteSummary | null>;
  getRouteDistance(routeId: string): Promise<RouteDistance | null>; // { km, status } — see below
  listRoutesForUser(userId: string): Promise<RouteSummary[]>;       // from RouteAssignment
  getHqZonePath(hqId: string): Promise<{ hqId: string; zoneId: string } | null>;
}
```

Consumers, per [`../roadmap.md`](../roadmap.md):

- **Field Master Data** (Tier 3) — a `Doctor`/`Chemist`'s territory attachment needs to validate
  a `Route`/`HQ` id exists.
- **Planning** (Tier 3) — a Daily Plan's route selection (PRD §6.2.A) reads `listRoutesForUser`
  to offer only routes the submitting MR is actually assigned.
- **Field Activity** (Tier 4) — TA auto-calculation
  ([`../hld/06-ta-da-auto-calculation.md`](../hld/06-ta-da-auto-calculation.md)) reads
  `getRouteDistance` and must handle a non-`CALCULATED` status as a flag, not a silent zero (see
  Edge cases below).

Territory itself depends only on Identity (Tier 1) — a `RouteAssignment.user_id` is validated
against `IdentityPublicContract`, never against `identity`'s Mongoose model directly.

## Write-path rules & invariants

- **A `Route` always belongs to exactly one `HQ`, which always belongs to exactly one `Zone`.**
  No orphaned routes; creating a `Route` requires a valid `hq_id`.
- **Waypoints are entered as resolved points, never raw text.** Per HLD 02 §1, Admin searches a
  Geocoding/Places API and confirms a pin on a map preview; what gets stored is
  `{label, latitude, longitude, place_id}`, not the typed string. A waypoint with no confirmed
  coordinates cannot be added to a route.
- **A `Route` may save before its distance resolves.** Master-data entry is never blocked on an
  external API being up — a route with `distance_status: PENDING` (still calculating) or
  `FAILED` (geocoding or the Directions call errored) is a valid, saved `Route`. See Edge cases.
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
| `POST` | `/api/territory/routes` | Admin | Create a Route under an HQ — triggers waypoint geocoding + distance calculation |
| `GET` | `/api/territory/routes` | Admin | List Routes, optionally filtered by HQ |
| `GET` | `/api/territory/routes/:id` | Admin, assigned MR/manager | Route detail, including current `distance_status` |
| `PATCH` | `/api/territory/routes/:id/waypoints` | Admin | Edit waypoints — re-triggers distance recalculation |
| `PATCH` | `/api/territory/routes/:id/distance` | Admin | Manually override `distance_km` |
| `POST` | `/api/territory/routes/:id/assignments` | Admin | Assign an MR to this Route |
| `DELETE` | `/api/territory/routes/:id/assignments/:userId` | Admin | Deactivate an MR's assignment to this Route |
| `GET` | `/api/territory/my-routes` | FIELD roles | The calling MR's own assigned Routes — consumed by Planning's route picker |

## Edge cases

- **Geocoding fails for a waypoint, or the Directions call errors/times out.** The `Route` still
  saves (master-data entry is never blocked on an external dependency); `distance_status` stays
  `FAILED` or `PENDING` and `distance_km` stays null. Anything downstream — TA auto-calculation
  specifically — must check this status and **flag** it rather than silently treat a null
  distance as zero. This is the one failure mode every consumer of `getRouteDistance` must
  handle explicitly.
- **A waypoint edit lands while a prior calculation is still in flight.** The write path should
  serialize per-route (last edit wins, not a race between two Directions responses writing over
  each other) — a concrete locking/versioning strategy is left to implementation, flagged here
  rather than specified, since the ERD doesn't commit to one.
- **An MR is assigned to overlapping or geographically nonsensical routes.** Nothing in the ERD
  or PRD constrains this — shared coverage is explicitly allowed ("a route may have more than one
  MR assigned"), and Territory has no reason to reject it.
- **A Route's `HQ` (or an `HQ`'s `Zone`) is reassigned after Routes/HQs already exist under it.**
  Not addressed by the ERD; treat as deliberately deferred (see below) rather than inventing a
  cascade/reparenting rule that isn't asked for.
- **Manual override, then the same admin "re-saves" waypoints unchanged.** Per the ERD's `status`
  semantics, *any* waypoint write resets to `AUTO_CALCULATED` — there's no distinction between an
  edit that changed geography and a no-op re-save. Accepted as-is; the ERD doesn't ask for one.

## Dependencies

- **Identity (Tier 1)** — validates `RouteAssignment.user_id` via `IdentityPublicContract`.
  Nothing else; Territory does not depend on any Tier 3+ module.

## Deliberately deferred

- **Doctor/Chemist ↔ Route attachment.** PRD §5.1 describes it; the ERD explicitly defers it to
  Field Master Data (Module 3) because `Doctor`/`Chemist` don't exist yet at this tier. Do not
  add this join to Territory when Module 3 lands — it belongs on the other side.
  *(`docs/roadmap.md`'s Phase 2 "done when" line currently reads "Admin can assign … Routes to a
  Doctor/Chemist's covering territory," which is this module's Phase 3-onward dependent, not
  something Territory itself does — worth correcting there to avoid implying this module owns
  that join.)*
- **An `Area` grouping level between `HQ` and `Route`.** Considered and dropped — nothing in the
  PRD needs it. Revisit only if a real requirement for it shows up.
- **Route geometry / map rendering.** Waypoints are stored as an ordered array of points, not
  normalized into their own table, because nothing yet needs to render the route on a map (only
  the distance matters). Revisit if that need appears.
- **A `Zone`/`HQ` reparenting or cascade-delete design.** Not specified by the ERD; don't invent
  one preemptively.
