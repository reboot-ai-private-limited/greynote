# HLD 2: Route Distance

Where `Route.distance_km` comes from (PRD §5.1), and what drives the TA portion of `Expense` (ERD Modules 2 & 4).

**Since 2026-10-14 the distance is typed by Admin.** Until then it was a Google road distance between the HQ's base place and a map-picked destination; on real routes it came back very wrong, and TA is paid on this number. The map, the HQ base place, the Google distance call, the recalculate / override actions and the revision check are gone. Decision-log 2026-10-14.

## 1. Creating a route

```mermaid
sequenceDiagram
    actor Admin
    participant Portal
    participant API
    participant DB

    Admin->>Portal: 1. Choose the HQ (SLG-1)
    Admin->>Portal: 2. Type the destination name (Naxalbari)
    Admin->>Portal: 3. Type the km (e.g. 18.50)
    Portal-->>Admin: 4. Type shown as "Automatic - Ex-station" (from EX/OUT_STATION_MIN_KM); dropdown can pick another
    Admin->>Portal: 5. Save
    Portal->>API: POST /territory/routes { hqId, destinationName, distanceKm, type? }
    API->>DB: name = "SLG-1 to Naxalbari", type, type_source, distance_km
    API-->>Portal: Route (with typeWarning if a chosen type disagrees with the km)
```

- **The name is made by the server:** `"<HQ> to <destination>"`. It is unique within the HQ, so one Route per destination per HQ.
- **The km is one way and is used as-is for TA** — never doubled (sign-off D7). More than 0, up to 2 decimals.
- **The type** is `AUTO` (follows the km: over `EX_STATION_MIN_KM` Ex-station, over `OUT_STATION_MIN_KM` Out-station, otherwise HQ) unless Admin picks one, which makes it `MANUAL`. A MANUAL type that disagrees with the km saves with a warning, never a refusal. Choosing "Automatic" on an edit hands it back to the km.

## 2. Editing

- **Destination** — re-makes the name. **Km** — a plain write; an `AUTO` type moves with it. **Type, TA rate, active / inactive** as before.
- **Renaming an HQ** re-names all its Routes ("<HQ> to <destination>"); their km is untouched.
- There is no recalculation and no "manual override" state: what is stored is what Admin typed. Two Admins editing at once: last write wins.

## 3. A Route with no km

Only a Route migrated from the map version whose Google lookup had failed. It is valid, `distance_km` is null, and TA for a day on it is **flagged**, never counted as 0 km (HLD 06). Admin types the km on the Route. `pnpm migrate:route-km` lists these.

## 4. What stays on Google

Place search for registered locations (doctors, chemists, distributors) — `GET /territory/places/search`, `GOOGLE_MAPS_API_KEY`. Routes do not use it.

## Next

This is HLD topic 2. See `README.md` for the index.
