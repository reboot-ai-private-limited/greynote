# Module 3: Field Master Data

Covers: `Doctor`, `Chemist`, `Distributor`, `Product`, `DoctorSampleAllocation`, and `DoctorAssignment` — plus the Doctor/Chemist ↔ Route attachment deferred from Module 2 (PRD §5.1, §6.2 A/B).

## Diagram

```mermaid
erDiagram
    ROUTE {
        uuid id PK
        string name "full Route entity defined in Module 2"
    }
    HQ {
        uuid id PK
        string name "full HQ entity defined in Module 2"
    }
    USER {
        uuid id PK
        string name "full User entity defined in Module 1"
    }

    DOCTOR {
        uuid id PK
        uuid route_id FK
        string category
        string name
        string address
        string email
        string specialty
        string qualification "class, e.g. MBBS, MD"
        decimal latitude "registered clinic location - for visit geofence validation"
        decimal longitude
        string status "active, inactive"
    }
    CHEMIST {
        uuid id PK
        uuid route_id FK
        string name
        string address
        decimal latitude "registered shop location - for visit geofence validation"
        decimal longitude
        string status "active, inactive"
    }
    DISTRIBUTOR {
        uuid id PK
        uuid hq_id FK
        string name
        string address
        string status "active, inactive"
    }
    PRODUCT {
        uuid id PK
        string name
        string sku UQ
        string category
        string status "active, inactive"
    }
    DOCTOR_SAMPLE_ALLOCATION {
        uuid id PK
        uuid doctor_id FK
        uuid product_id FK
        uuid allocated_by FK "Admin user who issued it"
        int quantity_allocated
        int quantity_remaining
        timestamp allocated_at
    }
    DOCTOR_ASSIGNMENT {
        uuid id PK
        uuid doctor_id FK
        uuid user_id FK
        date assigned_at
        string status "active, inactive"
    }

    ROUTE ||--o{ DOCTOR : "route_id"
    ROUTE ||--o{ CHEMIST : "route_id"
    HQ ||--o{ DISTRIBUTOR : "hq_id"
    DOCTOR ||--o{ DOCTOR_SAMPLE_ALLOCATION : "doctor_id"
    PRODUCT ||--o{ DOCTOR_SAMPLE_ALLOCATION : "product_id"
    USER ||--o{ DOCTOR_SAMPLE_ALLOCATION : "allocated_by (Admin)"
    DOCTOR ||--o{ DOCTOR_ASSIGNMENT : "doctor_id"
    USER ||--o{ DOCTOR_ASSIGNMENT : "user_id"
```

## Design decisions locked for this module

- **Chemist and Distributor are separate entities**, not a shared "Outlet" table — Chemist carries its own Call/Followup transactional flow (Module 4), Distributor doesn't, so merging them would leave a lot of unused fields either way.
- **Doctor and Chemist each get a single `route_id` FK.** One physical location, one route. No join table — simpler than Module 2's MR↔Route relationship because a clinic/pharmacy doesn't move or get double-covered the way MR assignments do.
- **Distributor attaches at the HQ level (`hq_id`), not the route level.** Matches how a stockist typically supplies an entire HQ area rather than one narrow route.
- **No separate Sample catalog.** `Product` is the single catalog for both orderable items and sample-eligible items. What makes something a "sample" is that it has been **allocated** to a doctor — modeled by `DoctorSampleAllocation`, not a flag on `Product`.
- **`DoctorSampleAllocation` is Admin-issued master data, not a field transaction.** Admin allocates a quantity of a `Product` to a specific `Doctor`. MRs assigned to that doctor (via `DoctorAssignment`, below) can see `quantity_remaining` to know what's available to give. The actual "gave 3 units during today's call" event — which decrements `quantity_remaining` — is a Module 4 transaction (Dr Call → Doctor Sample Provided), not modeled here.
- **`DoctorAssignment` is a direct many-to-many Doctor↔User link, separate from Route coverage.** Same shape as Module 2's `RouteAssignment`: a doctor can have more than one MR assigned, and an MR can be assigned to more than one doctor. This is deliberately independent of `Doctor.route_id` — a doctor sits on exactly one route (location), but *who is responsible for that doctor* (and therefore who sees their sample/gift allocations) is this table, not route coverage. `RouteAssignment` covering a route doesn't automatically grant visibility into every doctor on it.
- **Doctor and Chemist carry a registered `latitude`/`longitude`.** This is the reference point for geofence validation — checking whether the MR was actually physically present when they logged a call. Distributor doesn't get this, since there's no call/check-in flow for distributors in the PRD, only orders and stock counts.
- **The actual visit validation is a Module 4 concern, not this one.** This module only stores *where the doctor/chemist is supposed to be*. The MR's captured GPS coordinates at call time, the computed distance from the registered point, and a pass/fail flag belong on the Doctor Call / Chemist Call record itself. The allowed deviation radius (e.g. 200m) will live in `SystemConfig` (Module 5) alongside the other tunable rules, as `GEO_FENCE_RADIUS_METERS`.

## Next

**Module 4 — Field Activity: Calls & Follow-ups.** Doctor Call, Doctor Followup, Chemist Call, Chemist Followup, Doctor Service, Doctor Gifts — including the sample-given transaction that consumes `DoctorSampleAllocation`, and the geofence check against the `latitude`/`longitude` stored here.
