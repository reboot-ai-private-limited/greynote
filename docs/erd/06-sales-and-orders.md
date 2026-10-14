# Module 6: Sales & Orders

Covers: `Order` (+ `OrderItem`) and `MonthlyStock` — Chemist/Distributor monthly opening/closing counts (PRD §6.2 B, glossary "PRIMARY"/"SECONDARY" sales).

## Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string name "full User entity defined in Module 1"
    }
    DISTRIBUTOR {
        uuid id PK
        string name "full Distributor entity defined in Module 3"
    }
    CHEMIST {
        uuid id PK
        string name "full Chemist entity defined in Module 3"
    }
    PRODUCT {
        uuid id PK
        string name "full Product entity defined in Module 3"
    }

    ORDER {
        uuid id PK
        uuid user_id FK
        uuid distributor_id FK "nullable - exactly one of distributor_id/chemist_id is set"
        uuid chemist_id FK "nullable"
        date order_date
        string status "PLACED, DONE, CANCELLED"
        int total_amount_paise
        string remarks
        uuid completed_by FK "nullable - who marked it done"
        timestamp completed_at "nullable"
        timestamp created_at
    }
    ORDER_ITEM {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int quantity
        int unit_price_paise
        int amount_paise
    }
    MONTHLY_STOCK {
        uuid id PK
        uuid distributor_id FK "nullable - exactly one of distributor_id/chemist_id is set"
        uuid chemist_id FK "nullable"
        uuid product_id FK
        string month "e.g. 2026-10"
        int opening_qty
        int closing_qty
        uuid recorded_by FK
        timestamp recorded_at
    }

    USER ||--o{ ORDER : "user_id"
    USER ||--o{ ORDER : "completed_by"
    DISTRIBUTOR |o--o{ ORDER : "distributor_id (optional)"
    CHEMIST |o--o{ ORDER : "chemist_id (optional)"
    ORDER ||--o{ ORDER_ITEM : "order_id"
    PRODUCT ||--o{ ORDER_ITEM : "product_id"
    DISTRIBUTOR |o--o{ MONTHLY_STOCK : "distributor_id (optional)"
    CHEMIST |o--o{ MONTHLY_STOCK : "chemist_id (optional)"
    PRODUCT ||--o{ MONTHLY_STOCK : "product_id"
    USER ||--o{ MONTHLY_STOCK : "recorded_by"
```

## Design decisions locked for this module

- **Built as one document:** in MongoDB an `Order` carries its `OrderItem` lines embedded, not as a second collection (2026-09-30) — one write, and the total is checked against the lines by the schema. The tables above describe the fields, not separate collections.

- **`Order` attaches to either `Distributor` or `Chemist` via two nullable FKs, exactly one populated** (an app-level/DB check constraint — `CHECK (distributor_id IS NOT NULL) != (chemist_id IS NOT NULL)`), rather than a shared "Outlet" supertype. Consistent with Module 3's decision to keep `Chemist` and `Distributor` as separate entities. No link back to `ChemistCall` (Module 4) — Order is fully standalone, as already decided.
- **`Order` is line-itemized via `OrderItem`.** One order can carry multiple products/quantities; `total_amount` on `Order` is a denormalized sum of its items for quick display, kept in sync by application logic.
- **`Order` carries a completion lifecycle, same shape as `DoctorGift`.** `status` moves `PLACED → DONE` (or `CANCELLED`), with `completed_by`/`completed_at` recording who marked it fulfilled and when — same pattern as Module 4's Gift allocation, since "no manager approval" and "no completion tracking" aren't the same thing.
- **PRIMARY vs SECONDARY sales (PRD glossary) aren't a field anywhere — they're derived, not stored.** `Order` always represents a primary sale (an actual order placed with a distributor/chemist). Secondary sales aren't logged directly; they're computed from `MonthlyStock`'s opening/closing counts (roughly: `opening_qty + primary sales received during the month - closing_qty`) — that computation is reporting/application logic, not a schema concern.
- **`MonthlyStock` is one row per outlet + product + month**, with the same polymorphic Distributor/Chemist attachment as `Order`. `recorded_by` tracks which MR submitted the count.
- **`StockStatement` (2026-10-09)** is Admin's monthly entry for one distributor and product: `opening_qty`, `secondary_qty` (nullable), `adjustment_qty` (±) with `adjustment_reason`, `entered_by/at`, `updated_by/at` and a `history[]` of earlier values; unique on (distributor, product, month). It sits beside `MonthlyStock` (the field workers' count) and never overwrites it; closing is derived (`opening + primary − secondary`), never stored. A statement that states a secondary takes precedence over the count.
- **No approval workflow for `Order` or `MonthlyStock`.** PRD §7 only routes Tour Plans, DCR & Expenses, and (from Module 4) MR-submitted Doctor Service through manager approval — orders and stock counts are captured directly, same treatment as `DoctorGift`.

## Next

**Module 7 — HR Ops.** `Leave` and `Holiday` — including `Holiday.hq_id`, tying the holiday calendar to the HQ hierarchy from Module 2.

## `EmployeeSale` (2026-10-10)

One field employee's figures for one product and one month: `user_id`, `product_id`, `month` (`YYYY-MM`), `secondary_qty` (what they say they sold; null = nothing entered), `adjustment_qty` (Admin's change to their primary, ± whole units) with `adjustment_reason` (required when ≠ 0), `updated_by/at` and a `history[]` of the old values. Unique on `(user_id, product_id, month)`. The two figures have separate writers (the employee, their manager or Admin for secondary; Admin only for the adjustment). Primary itself is not stored: it is the employee's Done distributor orders plus the adjustment. No distributor is recorded: nothing here feeds a distributor's stock.

## `EmployeeSale` — approval and amount (2026-10-12)

Adds `secondary_amount_paise` (units × the product's PTR when entered; null with no PTR) and `secondary_status` (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`; a row with no value reads as `APPROVED`). Only `APPROVED` secondary counts toward achievement. The approval request is `SECONDARY_SALES` with `record_id = user_id:month`. Order: a chemist `Order` is information only and never leaves `PLACED`; only a distributor order moves to `DONE`/`CANCELLED`.

## 2026-10-14 — office orders, edits, PTS

`orders` gains `created_by` (the Admin/Accountant who added it for the employee; null when the employee placed it), `edited_by` and `edited_at` (the last change to a `PLACED` order's lines or remarks). `employee_sales.secondary_amount_paise` is units × the product's **PTS** (rows saved earlier at PTR are restated on read). No new collection; no migration needed (the fields default to null).

## 2026-10-14 — part supply, free units

`orders.items[]` gains `supplied_qty` (null until Done, then 0..quantity) and `free_qty` (default 0); `orders` gains `supplied_amount_paise` (null until Done). Nothing existing is rewritten: a Done order with nulls reads as fully supplied. Aggregations count units as supplied + free and rupees as supplied × price.
