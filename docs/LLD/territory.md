# Territory

The hierarchy field operations are organized against — `Zone → HQ → Route` — and what turns a route
into a travel-allowance figure: the **km Admin types** for "HQ to destination". There is no map and
no distance lookup (decision-log 2026-10-14). PRD §5.1; full entity model in
[`../erd/02-territory-master.md`](../erd/02-territory-master.md); the rule in full in
[`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md).

## What it owns

- **`Zone`** — top of the hierarchy (e.g. West Bengal Zone). Name only at this tier; nothing
  spatial is stored on it directly.
- **`HQ`** — belongs to one `Zone`. A headquarters (e.g. SLG-1 and SLG-2, two HQs in Siliguri).
  A name only. (It had a map-confirmed *base place* until 2026-10-14; that was the origin of the
  Google distance and is gone.) Renaming an HQ re-names its Routes.
- **`Route`** — belongs to one `HQ`. A **destination name** (typed, e.g. Naxalbari), the **km**
  Admin typed (`distance_km`, one way, used as-is), a `type` (`HQ` | `EX_STATION` | `OUT_STATION`,
  which decides which of a grade's DA rates applies to a day worked there — HLD 06 §2) and its
  `type_source` (`AUTO` | `MANUAL`). Its **name is always "<HQ> to <destination>"** (SLG-1 to
  Naxalbari), made by the server. Decision-log 2026-10-14 (this replaced the map and the Google
  distance).
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

**Manager visibility is still the reporting chain** (client rules §18): Identity's `manager_id` + `getDownline` (HLD 05 §3).
Since 2026-10-15 a manager may also carry a **coverage** (below), used only to decide who is *offered* as a reporting
manager. It never changes approvals or the downline.

### Manager coverage (2026-10-15)

`ManagerCoverage { userId, hqIds[], zoneIds[] }` (one document per manager, replaced whole). ASM and RSM cover a set of HQs (an
RSM's "region" is just that set; there is no Region entity); a ZSM covers whole Zones; the NSM needs none and covers everywhere.
- `PUT/GET /api/territory/users/:userId/coverage` (Admin, HR): HQs/zones must exist and be active; only a field employee at ASM or above.
- `GET /api/territory/manager-candidates?level&hqId&search&excludeUserId` (Admin, HR, Accountant): active field employees above `level`
  (any higher designation, vacant levels may be skipped), whose HQ coverage or Zone coverage includes `hqId`; the NSM always; a manager
  with no coverage recorded is listed with `coverage: 'none'` (not blocked). Nearest level first, covering managers before `none`.

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
  distanceKm: string | null;           // typed by Admin; null only for a Route migrated without a km; never doubled
  distanceStatus: 'CALCULATED' | 'FAILED';   // FAILED exactly when distanceKm is null (kept so TA and the phone did not change)
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
  `getRoute` for TA (`distanceKm`, `taPerKmRateOverridePaise`), and must handle a Route with no km (`FAILED`) as a
  flag, not a silent zero (see Edge cases below). `routeType` on the same summary gives DA.

Territory itself depends only on Identity (Tier 1) — a `RouteAssignment.user_id` is validated
through `IdentityPublicContract.findUserSummary` (the user must exist, be `FIELD`, and not be
`inactive`; a `pending` user still onboarding can be assigned), never against `identity`'s
Mongoose model directly.

## Write-path rules & invariants

- **A `Route` always belongs to exactly one `HQ`, which belongs to exactly one `Zone`.** No
  orphaned routes; creating a `Route` requires a valid, active `hq_id`, a **destination name** and a
  **km** (more than 0, up to 2 decimals). The `type` is optional (see Route type below).
- **The name is made, not typed:** `"<HQ name> to <destination name>"`. Changing the destination
  re-makes it; renaming the HQ re-makes it for all of that HQ's Routes, active or not.
- **Names are unique within their parent**, case-insensitive: Zone globally, HQ per Zone, Route
  per HQ — and since the HQ is part of the Route's name, that is one Route per destination per HQ.
- **Nothing is hard-deleted.** A Zone can't be deactivated while it has an active HQ, an HQ can't
  be deactivated while it has an active Route, and a Route can't be deactivated while it has an
  active `RouteAssignment`.
  Nothing can be created or reactivated under an inactive parent. A node's parent can't be
  changed (no reparenting; see Deliberately deferred).
- **`distance_km` is used as-is for TA — never doubled for a return trip.** Admin types the full paid
  travel (decision-log 2026-09-24).
- **The km is typed, so it is right when it is saved.** The map version asked Google for a road distance
  and it came back very wrong on real routes; with TA paid on the number, a person who knows the road
  is more reliable. There is no recalculation, no override flag and no revision check: a km edit is a
  plain write, and last write wins.
- **`RouteAssignment` is additive, never a silent overwrite.** Reassigning or deactivating an
  MR's coverage of a route changes a `RouteAssignment` row's `status`; it does not delete or
  overwrite prior assignment history.

## Route km (no map)

Admin picks an HQ, types the destination name and the km, and saves. Nothing calls Google for a
route. Google is still used for one thing: **place search** (`GET /api/territory/places/search`,
`PlaceSearchPort` → Places API (New) Text Search), which the doctor / chemist / distributor location
picker uses. It needs `GOOGLE_MAPS_API_KEY`; without it the search returns `503`.

Full rule, and why the map went: [`../hld/02-route-distance-calculation.md`](../hld/02-route-distance-calculation.md).

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/territory/zones` | Admin | Create a Zone |
| `GET` | `/api/territory/zones` | Admin | List Zones |
| `POST` | `/api/territory/hqs` | Admin | Create an HQ under a Zone (name only) |
| `GET` | `/api/territory/hqs` | Admin | List HQs, optionally filtered by Zone |
| `POST` | `/api/territory/routes` | Admin | Create a Route from `hqId`, `destinationName`, `distanceKm` and an optional `type` — named "<HQ> to <destination>" |
| `GET` | `/api/territory/routes` | Admin | List Routes, optionally filtered by HQ, Zone or `type` |
| `GET` | `/api/territory/routes/:id` | Admin | Route detail (an MR sees their routes via `my-routes`; manager views of a downline's routes come with the Team tab) |
| `POST` | `/api/territory/routes/:id/assignments` | Admin | Assign a FIELD employee to this Route |
| `GET` | `/api/territory/routes/:id/assignments` | Admin | Who covers this Route, with employee code/name; full history unless `?status=` |
| `DELETE` | `/api/territory/routes/:id/assignments/:userId` | Admin | End an employee's assignment — the row becomes `inactive` history, not deleted |
| `PATCH` | `/api/territory/zones/:id`, `/hqs/:id`, `/routes/:id` | Admin | Rename (an HQ rename re-names its Routes), deactivate/reactivate; on a Route also `destinationName`, `distanceKm`, `type` / `typeSource: 'AUTO'` and `taPerKmRateOverridePaise` |
| `GET` | `/api/territory/places/search?q=` | Admin | Proxy to Google Places for registered locations (doctors, chemists, distributors) — candidates with `{label, address, latitude, longitude, placeId}`; the API key never leaves the server |
| `POST` | `/api/territory/import` | Admin | CSV bulk import of Zone / HQ rows (not Routes: a Route needs a destination and a km); `?dryRun=true` previews. See CSV import below |
| `GET` | `/api/territory/my-routes` | FIELD roles | The calling MR's own assigned Routes — consumed by Planning's route picker |
| `PUT` | `/api/territory/users/:userId/hq` | Admin, HR | Set a FIELD employee's HQ (ends the previous one) |
| `GET` | `/api/territory/users/:userId/hq` | Admin, HR | The employee's current HQ and its history |
| `GET` | `/api/territory/users/:userId/routes` | Admin, HR | The active routes the employee covers (employee page Routes card; add/remove use the route assignment endpoints, Admin) |

## CSV import

`POST /api/territory/import`, multipart `file` (≤ 1 MB, ≤ 2000 rows). One row per path:

```csv
zone,hq
West Bengal,SLG-1
West Bengal,SLG-2
Sikkim,
```

- `zone` is required; `hq` is optional. Headers are case-insensitive. Excel's BOM, quoted fields
  and CRLF are handled. Routes are added afterwards in the app.
- **Existing names are reused, never changed** (same case-insensitive match as the API), so
  re-uploading a file is a no-op and a write interrupted part-way can be re-run.
- **All or nothing on validation.** The whole file is checked first — row shape, inactive
  parents — and any problem returns `400` with `errors: [{ line, message }]` for every problem and
  nothing written. Line numbers are the file's own (blank lines counted).
- `?dryRun=true` returns the same `{ created, existing }` report without writing — the web
  portal's preview step.
- Import never changes an existing HQ; renaming one stays a deliberate edit in the app, because it
  re-names its Routes.

## Edge cases

- **A Route has no km** (only one migrated from the map version whose Google lookup had failed). It is
  valid and saved, `distanceKm` is null and `distanceStatus` reads `FAILED`. Anything downstream — TA
  auto-calculation specifically — must **flag** it rather than silently treat a null distance as
  zero. Admin types the km on the Route, which clears it. New Routes cannot be created without one.
- **Two Admins edit the same Route at once.** Last write wins; there is no revision check any more
  (it existed to stop an edit racing a slow Google call).
- **An MR is assigned to overlapping or geographically nonsensical routes.** Nothing in the ERD
  or PRD constrains this — shared coverage is explicitly allowed ("a route may have more than one
  MR assigned"), and Territory has no reason to reject it.
- **Route type follows the km (2026-10-05, 2026-10-14).** `type` is `AUTO` or `MANUAL` (`typeSource`). Created without a type,
  a Route is AUTO: over `EX_STATION_MIN_KM` (15) km it is `EX_STATION`, over `OUT_STATION_MIN_KM` (50) `OUT_STATION`, otherwise
  `HQ` (strictly "over"); with no km it starts as `HQ` and follows the km once one is typed. A km edit re-applies it to AUTO
  Routes. The web form shows what Automatic gives while the km is typed, and the dropdown can pick another type. Choosing a type makes
  the Route MANUAL, kept as chosen; if the km disagrees the Route read carries `typeWarning` (the warning is never a
  refusal, and DA uses the type that is set). `PATCH` with `typeSource: 'AUTO'` hands it back to the km.
- **A Route's `type` is edited after DA has already been generated for days worked on it.** Past
  `AUTO` DA `Expense` rows stay as generated (the locked-snapshot rule in HLD 06 §3); only future
  approvals use the new type.
- **A Route's `HQ` (or an `HQ`'s `Zone`) is reassigned after children already exist under it.**
  Not addressed by the ERD; treat as deliberately deferred (see below) rather than inventing a
  cascade/reparenting rule that isn't asked for.

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
- **Multi-stop Routes and route geometry.** A Route is one destination; the path is not stored,
  because only the km matters. A trip with a stop in the middle is one Route per destination, or one
  Route with the total km typed. Revisit if the
  client needs "via" stops (decision-log 2026-10-03 lists it as rejected).
- **A `Zone`/`HQ` reparenting or cascade-delete design.** Not specified by the ERD; don't invent
  one preemptively.

## Employee HQ also copied to the profile (2026-10-09)

`SetUserHqUseCase` calls `UserDirectoryPort.recordUserTerritory(userId, { hqId, zoneId })` (Identity's contract) after the assignment is saved, and on a no-change save too, so Identity's employee list can show the zone without reading Territory. The assignment and its history remain here.
