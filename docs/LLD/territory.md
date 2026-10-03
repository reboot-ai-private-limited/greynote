# Territory

The spatial hierarchy field operations are organized against — `Zone → HQ → Route` — and the
mechanism that turns a route into a travel-allowance figure: the real road distance from the HQ's
base place to the route's destination place. PRD §5.1; full entity model in
[`../erd/02-territory-master.md`](../erd/02-territory-master.md); the distance algorithm in full
in [`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md).

## What it owns

- **`Zone`** — top of the hierarchy (e.g. West Bengal Zone). Name only at this tier; nothing
  spatial is stored on it directly.
- **`HQ`** — belongs to one `Zone`. A headquarters (e.g. SLG-1 and SLG-2, two HQs in Siliguri).
  Carries a **base place** (`{label, latitude, longitude, place_id}`, e.g. Siliguri) — the origin
  of every one of its Routes. Required on create; an HQ that predates the base place has none
  until an Admin sets it, and can't get a Route until then.
- **`Route`** — belongs to one `HQ`. One **destination place** (`{label, latitude, longitude,
  place_id}`, e.g. Naxalbari), a `type` (`HQ` | `EX_STATION` | `OUT_STATION`, which decides which
  of a grade's DA rates applies to a day worked there — HLD 06 §2), a computed road distance from
  the HQ's base place to the destination (`distance_km`), and that distance's provenance/status
  (`distance_source`: `AUTO_CALCULATED` | `MANUAL_OVERRIDE`; `distance_status`: `CALCULATED` |
  `FAILED`; `distance_calculated_at`; `revision`). Decision-log 2026-10-03 (this replaced `Area`
  and the waypoint list).
- **`RouteAssignment`** — the MR ↔ `Route` join. Many-to-many: a route can have several MRs
  (shared coverage), an MR can cover several routes. Carries `assigned_at` and `status`
  (`active`/`inactive`) as a lightweight assignment history, rather than a single FK that
  silently loses history on reassignment.
- **`UserHqAssignment`** — a FIELD employee's HQ (decision-log 2026-09-28). At most one active
  row per user, history kept the same way as `RouteAssignment`; setting a new HQ ends the old row
  and starts a new one in one transaction. Set by Admin or HR. HR's HQ/Zone holidays read it; an
  employee without one gets only National holidays. It doesn't restrict which Routes they can be
  assigned.

Full field list: [`../erd/02-territory-master.md`](../erd/02-territory-master.md).

**Explicitly not owned here.** PRD §5.1 also describes Admin "attaching Doctors/Chemists to
routes" (client rules §17.2 add Distributors) and directly assigning MRs to specific Doctors —
those joins belong to Field Master Data (ERD Module 3), deferred there because
`Doctor`/`Chemist`/`Distributor` don't exist as entities yet at this tier. Territory's own
`RouteAssignment` is MR ↔ Route only.

**No per-designation territory scope.** Managers (ASM/RSM/ZSM/NSM) are not assigned to an
HQ/Zone here. Client rules §18 define manager visibility purely by reporting chain, which
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
  /** Route ids under an HQ or Zone (most specific given) — for filtering another module's lists by territory. */
  listRouteIdsInScope(scope: { hqId?: string; zoneId?: string }): Promise<string[]>;
  getUserHq(userId: string): Promise<{ hqId: string; zoneId: string } | null>;  // active assignment
  getHq(hqId: string): Promise<{ id: string; zoneId: string; name: string; status: TerritoryStatus } | null>;
  getZone(zoneId: string): Promise<{ id: string; name: string; status: TerritoryStatus } | null>;
}

// No coordinates — consumers need the TA/DA inputs, not the geometry.
interface RouteSummary {
  id: string; name: string; hqId: string; hqName: string;
  routeType: RouteType;                // decides DA
  distanceKm: string | null;           // null exactly when distanceStatus is FAILED; never doubled
  distanceStatus: 'CALCULATED' | 'FAILED';
  taPerKmRateOverridePaise: number | null;   // whole paise per km
  status: 'active' | 'inactive';
}
interface RoutePath { routeId: string; routeType: RouteType; hqId: string; zoneId: string }
```

The planned separate `getRouteDistance` was folded into `getRoute`: `RouteSummary` already
carries the distance, its status and the TA rate override, so a second method would only mean a
second round trip for Field Activity.

Consumers, per [`../roadmap.md`](../roadmap.md):

- **Field Master Data** (Tier 3) — a `Doctor`/`Chemist`/`Distributor`'s territory attachment
  needs to validate a `Route` id exists, and list screens resolve its HQ/Zone breadcrumb via
  `getRoutePath`.
- **Planning** (Tier 3) — a Daily Plan's route selection (PRD §6.2.A) reads `listRoutesForUser`
  to offer only routes the submitting MR is actually assigned.
- **Field Activity** (Tier 4) — TA/DA auto-calculation
  ([`../hld/06-ta-da-auto-calculation.md`](../hld/06-ta-da-auto-calculation.md)) reads
  `getRoute` for TA (`distanceKm`, `taPerKmRateOverridePaise`), and must handle a `FAILED` status as a
  flag, not a silent zero (see Edge cases below). `routeType` on the same summary gives DA.

Territory itself depends only on Identity (Tier 1) — a `RouteAssignment.user_id` is validated
through `IdentityPublicContract.findUserSummary` (the user must exist, be `FIELD`, and not be
`inactive`; a `pending` user still onboarding can be assigned), never against `identity`'s
Mongoose model directly.

## Write-path rules & invariants

- **A `Route` always belongs to exactly one `HQ`, which belongs to exactly one `Zone`.** No
  orphaned routes; creating a `Route` requires a valid, active `hq_id` **that has a base place**,
  a `destination` and a `type`.
- **Places are entered as resolved points, never raw text.** Per HLD 02 §1, Admin searches a
  Geocoding/Places API and confirms a pin on a map preview; what gets stored — for an HQ's base
  place and a Route's destination alike — is `{label, latitude, longitude, place_id}`, not the
  typed string. A place with no confirmed coordinates cannot be saved.
- **A `Route` may save before its distance resolves.** Master-data entry is never blocked on an
  external API being up — a route with `distance_status: FAILED` (the Directions call errored
  or timed out, ~5 s) is a valid, saved `Route`. Admin retries with `POST
  /routes/:id/recalculate`. See Edge cases.
- **Names are unique within their parent**, case-insensitive: Zone globally, HQ per Zone, Route
  per HQ.
- **Nothing is hard-deleted.** A Zone can't be deactivated while it has an active HQ, an HQ can't
  be deactivated while it has an active Route, and a Route can't be deactivated while it has an
  active `RouteAssignment`.
  Nothing can be created or reactivated under an inactive parent. A node's parent can't be
  changed (no reparenting; see Deliberately deferred).
- **`distance_km` is used as-is for TA — never doubled for a return trip.** Admin enters the
  route (or overrides the distance) to cover the full paid travel (decision-log 2026-09-24).
- **Distance is recalculated, not frozen, on every destination edit.** Changing a Route's
  destination immediately triggers a fresh Directions-API call (blocking — the web portal is not
  offline-first, so this is acceptable at save time) and resets `distance_source` back to
  `AUTO_CALCULATED`, overwriting any prior manual override. A route's distance therefore always
  reflects the route's *current* geography — never a stale figure left over from before an edit.
- **Changing an HQ's base place recalculates its active Routes** — except those with
  `distance_source: MANUAL_OVERRIDE`, which keep their hand-entered distance. The response lists
  how many were recalculated, how many failed, and which overridden Routes were left alone, so an
  Admin can re-check those. Without this an HQ edit would either leave every distance stale or
  silently throw away overrides.
- **Admin may manually override the calculated distance directly**, setting
  `distance_source: MANUAL_OVERRIDE`. This exists because real money (TA) moves on this number,
  and an inaccurate auto-calculated figure shouldn't be locked in until someone notices. The
  override does **not** survive the next destination edit — see above.
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
- `DistanceProviderPort` → **Routes API** `computeRoutes`, `DRIVE`, origin = the HQ's base place,
  destination = the Route's destination, field mask `routes.distanceMeters` (cheapest SKU). Never
  throws: any failure (HTTP error, no drivable route, 5 s timeout) is logged and the route is
  saved `FAILED`.

Needs `GOOGLE_MAPS_API_KEY` with both APIs enabled; without it the API boots, place search
returns `503 SERVICE_UNAVAILABLE`, and routes save as `FAILED`. Unit tests use a fake provider.

Full sequence diagrams and failure-handling rationale:
[`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md). Summary at
this module's depth:

1. Admin types a place name (the HQ's base place, or a Route's destination) → Places search →
   candidates shown as pins on a map preview → Admin confirms one → `{label, latitude, longitude,
   place_id}` stored.
2. On Route save, the HQ's base place and the destination go to the Routes API → road distance
   comes back → `distance_km`, `distance_source: AUTO_CALCULATED`, `distance_status: CALCULATED`
   are written together.
3. A later destination edit re-runs step 2 automatically, and so does a change to the HQ's base
   place (for its non-overridden Routes). A direct edit to `distance_km` instead sets
   `distance_source: MANUAL_OVERRIDE` and leaves the destination untouched.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/territory/zones` | Admin | Create a Zone |
| `GET` | `/api/territory/zones` | Admin | List Zones |
| `POST` | `/api/territory/hqs` | Admin | Create an HQ under a Zone, with its base place |
| `GET` | `/api/territory/hqs` | Admin | List HQs, optionally filtered by Zone |
| `POST` | `/api/territory/routes` | Admin | Create a Route (with `type` and `destination`) under an HQ — triggers the distance calculation |
| `GET` | `/api/territory/routes` | Admin | List Routes, optionally filtered by HQ, Zone or `type` |
| `GET` | `/api/territory/routes/:id` | Admin | Route detail, including current `distance_status` (an MR sees their routes via `my-routes`; manager views of a downline's routes come with the Team tab) |
| `PATCH` | `/api/territory/routes/:id/destination` | Admin | Change the destination place — re-triggers distance recalculation |
| `PATCH` | `/api/territory/routes/:id/distance` | Admin | Manually override `distance_km` |
| `POST` | `/api/territory/routes/:id/assignments` | Admin | Assign a FIELD employee to this Route |
| `GET` | `/api/territory/routes/:id/assignments` | Admin | Who covers this Route, with employee code/name; full history unless `?status=` |
| `DELETE` | `/api/territory/routes/:id/assignments/:userId` | Admin | End an employee's assignment — the row becomes `inactive` history, not deleted |
| `POST` | `/api/territory/routes/:id/recalculate` | Admin | Retry the Directions call (e.g. after `FAILED`); resets any manual override like a destination edit |
| `PATCH` | `/api/territory/zones/:id`, `/hqs/:id`, `/routes/:id` | Admin | Rename, deactivate/reactivate (and an HQ's `basePlace` — recalculates its non-overridden Routes; a Route's `type` and `taPerKmRateOverridePaise`) |
| `GET` | `/api/territory/places/search?q=` | Admin | Proxy to Google Places — candidates with `{label, latitude, longitude, place_id}`; the API key never leaves the server |
| `POST` | `/api/territory/import` | Admin | CSV bulk import of Zone / HQ rows (not Routes, and an HQ's base place is set afterwards in the app — both need confirmed pins); `?dryRun=true` previews. See CSV import below |
| `GET` | `/api/territory/my-routes` | FIELD roles | The calling MR's own assigned Routes — consumed by Planning's route picker |
| `PUT` | `/api/territory/users/:userId/hq` | Admin, HR | Set a FIELD employee's HQ (ends the previous one) |
| `GET` | `/api/territory/users/:userId/hq` | Admin, HR | The employee's current HQ and its history |

## CSV import

`POST /api/territory/import`, multipart `file` (≤ 1 MB, ≤ 2000 rows). One row per path:

```csv
zone,hq
West Bengal,SLG-1
West Bengal,SLG-2
Sikkim,
```

- `zone` is required; `hq` is optional. Headers are case-insensitive. Excel's BOM, quoted fields
  and CRLF are handled. An HQ created by import has **no base place yet** (it needs a
  map-confirmed pin); an Admin sets it in the app, and until then the HQ can't get a Route.
- **Existing names are reused, never changed** (same case-insensitive match as the API), so
  re-uploading a file is a no-op and a write interrupted part-way can be re-run.
- **All or nothing on validation.** The whole file is checked first — row shape, inactive
  parents — and any problem returns `400` with `errors: [{ line, message }]` for every problem and
  nothing written. Line numbers are the file's own (blank lines counted).
- `?dryRun=true` returns the same `{ created, existing }` report without writing — the web
  portal's preview step.
- Import never changes an existing HQ, including its base place; that stays a deliberate edit in
  the app, because it recalculates distances.

## Edge cases

- **The Directions call errors or times out.** The `Route` still
  saves (master-data entry is never blocked on an external dependency); `distance_status` stays
  `FAILED` and `distance_km` stays null. Anything downstream — TA auto-calculation
  specifically — must check this status and **flag** it rather than silently treat a null
  distance as zero. This is the one failure mode every consumer of `getRouteDistance` must
  handle explicitly.
- **Two Admins edit the same Route at once, or an edit races a slow recalculation.** Every write
  that changes the destination or distance (destination edit, recalculate, override) is conditional on the
  `revision` it started from and bumps it. A destination edit sends the `revision` the Admin's screen
  showed; recalculate and override use the one read at the start of the request. A stale revision
  gets `409 Conflict` (with `currentRevision`) instead of silently overwriting the newer write.
  Rename, status and the TA rate override don't touch distance and aren't revision-checked.
- **An MR is assigned to overlapping or geographically nonsensical routes.** Nothing in the ERD
  or PRD constrains this — shared coverage is explicitly allowed ("a route may have more than one
  MR assigned"), and Territory has no reason to reject it.
- **A Route's `type` is edited after DA has already been generated for days worked on it.** Past
  `AUTO` DA `Expense` rows stay as generated (the locked-snapshot rule in HLD 06 §3); only future
  approvals use the new type.
- **An HQ's base place is changed while some of its Routes have a manual override.** Those Routes
  keep their distance and are named in the response. Recalculating the others can partly fail (a
  Route that comes back `FAILED`); the response counts those too, and Admin retries each with
  `POST /routes/:id/recalculate`.
- **A Route's `HQ` (or an `HQ`'s `Zone`) is reassigned after children already exist under it.**
  Not addressed by the ERD; treat as deliberately deferred (see below) rather than inventing a
  cascade/reparenting rule that isn't asked for.
- **Manual override, then the same admin "re-saves" the destination unchanged.** Per the ERD's `status`
  semantics, *any* destination write resets to `AUTO_CALCULATED` — there's no distinction between an
  edit that changed geography and a no-op re-save. Accepted as-is; the ERD doesn't ask for one.
- **An HQ with no base place** (it predates the base place, or came from CSV import). It can't get a
  Route; creating one is refused with a message saying to set the base place first. Its existing
  Routes (from before the change) keep their stored distance until the base place is set.

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
- **Multi-stop Routes and route geometry.** A Route is one destination; the path between the base
  place and the destination is not stored, because only the distance matters. A trip with a stop
  in the middle is one Route per destination, or a manual distance override. Revisit if the
  client needs "via" stops (decision-log 2026-10-03 lists it as rejected).
- **A `Zone`/`HQ` reparenting or cascade-delete design.** Not specified by the ERD; don't invent
  one preemptively.
