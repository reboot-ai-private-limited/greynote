# Module 3: Field Master Data

Covers: `Doctor`, `Chemist`, `Distributor`, `Product`, `DoctorSampleAllocation`, and `DoctorAssignment` — plus the Doctor/Chemist/Distributor ↔ Route attachment deferred from Module 2 (PRD §5.1, §6.2 A/B; client Master spec M4–M6, client rules §17).

## Diagram

```mermaid
erDiagram
    ROUTE {
        uuid id PK
        string name "full Route entity defined in Module 2"
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
        decimal latitude "nullable - registered clinic location for visit geofence validation"
        decimal longitude "nullable"
        decimal captured_latitude "nullable - the MR phone's GPS when adding, kept if Admin corrects the point"
        decimal captured_longitude "nullable"
        uuid added_by FK "the MR, or Admin"
        string client_request_id "MR-added only - unique per added_by, makes an offline retry safe"
        timestamp approved_at "nullable - Phase 6 coverage wait counts from here"
        string status "pending, active, inactive - pending until an MR-added Doctor is approved"
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
        uuid route_id FK "Zone/HQ/Area reached via Route"
        string name
        string gst_number
        string contact_person
        string mobile
        string address
        decimal latitude "registered location"
        decimal longitude
        uuid assigned_mr_id FK "nullable - single current MR"
        uuid assigned_asm_id FK "nullable - single current ASM"
        boolean primary_sales_enabled "stated explicitly by Admin, no default"
        boolean secondary_sales_enabled
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
        string status "active, inactive - at most one active row per doctor"
    }

    ROUTE ||--o{ DOCTOR : "route_id"
    ROUTE ||--o{ CHEMIST : "route_id"
    ROUTE ||--o{ DISTRIBUTOR : "route_id"
    USER |o--o{ DISTRIBUTOR : "assigned_mr_id / assigned_asm_id"
    DOCTOR ||--o{ DOCTOR_SAMPLE_ALLOCATION : "doctor_id"
    PRODUCT ||--o{ DOCTOR_SAMPLE_ALLOCATION : "product_id"
    USER ||--o{ DOCTOR_SAMPLE_ALLOCATION : "allocated_by (Admin)"
    DOCTOR ||--o{ DOCTOR_ASSIGNMENT : "doctor_id"
    USER ||--o{ DOCTOR_ASSIGNMENT : "user_id"
```

## Design decisions locked for this module

- **Chemist and Distributor are separate entities**, not a shared "Outlet" table — Chemist carries its own Call/Followup transactional flow (Module 4), Distributor doesn't, so merging them would leave a lot of unused fields either way.
- **Doctor and Chemist each get a single `route_id` FK.** One physical location, one route. No join table — simpler than Module 2's MR↔Route relationship because a clinic/pharmacy doesn't move or get double-covered the way MR assignments do.
- **Distributor attaches at the Route level (`route_id`), same as Doctor and Chemist.** Client rules §17.2: "A Route can contain multiple: Doctors, Chemists, Distributors." Zone/HQ/Area are shown on the Distributor screen as a breadcrumb resolved through the Route, not stored. (An earlier version attached Distributor to `hq_id`; reversed 2026-09-24, `docs/decision-log.md`.)
- **Distributor visibility = Route coverage + a direct assignment field.** Client rules §17.3: visibility is "controlled through Route and manual assignment rules". An MR sees a Distributor if a `RouteAssignment` covers its Route, or if they are its `assigned_mr_id`. Managers see their downline's Distributors through the reporting chain (HLD 05 §3). No separate Distributor↔User join table.
- **`assigned_mr_id` / `assigned_asm_id` are single-value.** This follows from the one-Doctor-one-MR rule below. The client has not stated it separately for Distributors; if a Distributor ever needs several concurrent MRs, it becomes a join table shaped like `DoctorAssignment`.
- **No separate Sample catalog.** `Product` is the single catalog for both orderable items and sample-eligible items. What makes something a "sample" is that it has been **allocated** to a doctor — modeled by `DoctorSampleAllocation`, not a flag on `Product`.
- **One `DoctorSampleAllocation` row per (Doctor, Product)** (unique). Issuing more samples adds to it; `allocated_by` / `allocated_at` are the latest issue or adjustment. `quantity_remaining` never goes below zero — enforced by a conditional update and by the schema. Admin can correct `quantity_allocated`, but not below what has been given.
- **`DoctorSampleAllocation` is Admin-issued master data, not a field transaction.** Admin allocates a quantity of a `Product` to a specific `Doctor`. MRs assigned to that doctor (via `DoctorAssignment`, below) can see `quantity_remaining` to know what's available to give. The actual "gave 3 units during today's call" event — which decrements `quantity_remaining` — is a Module 4 transaction (Dr Call → Doctor Sample Provided), not modeled here.
- **`DoctorAssignment` gives each Doctor exactly one responsible MR at a time.** An MR can be responsible for many doctors, but a doctor has at most one `status: active` row. Reassigning a doctor deactivates the current row and inserts a new one, so the table doubles as assignment history (same never-overwrite shape as `RouteAssignment`). This answers the client's open question on one-doctor-per-MR vs. shared doctors (client rules §31). The MR's managers still see and act on that doctor through the reporting chain (HLD 05 §3); that isn't an assignment. This is deliberately independent of `Doctor.route_id` — a doctor sits on exactly one route (location), but _who is responsible for that doctor_ (and therefore who sees their sample/gift allocations) is this table, not route coverage. (Previously many-to-many; changed 2026-09-24, `docs/decision-log.md`.)
- **A Doctor is added by an MR (phone GPS, offline-first, then approved) or by Admin (map).** See `LLD/field-master-data.md`. The MR's capture is kept beside the registered point when Admin corrects it, and a `pending` Doctor is invisible to every other module. Which Doctors an MR sees follows their current Routes while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` is on.
- **Doctor, Chemist and Distributor carry a registered `latitude`/`longitude`.** For Doctor and Chemist this is the reference point for geofence validation of calls. Distributor gets it too per the client Master spec (M6). No distributor check-in flow uses it yet, so for now it's reference data only.
- **The actual visit validation is a Module 4 concern, not this one.** This module only stores _where the doctor/chemist is supposed to be_. The MR's captured GPS coordinates at call time, the computed distance from the registered point, and a pass/fail flag belong on the Doctor Call / Chemist Call record itself. The allowed deviation radius (e.g. 200m) will live in `SystemConfig` (Module 5) alongside the other tunable rules, as `GEO_FENCE_RADIUS_METERS`.

## Next

**Module 4 — Field Activity: Calls & Follow-ups.** Doctor Call, Doctor Followup, Chemist Call, Chemist Followup, Doctor Service, Doctor Gifts — including the sample-given transaction that consumes `DoctorSampleAllocation`, and the geofence check against the `latitude`/`longitude` stored here.
