# Sales & Orders

Standalone order capture and monthly stock counting for Distributors and Chemists (PRD §6.2.B,
ERD Module 6). "Standalone" is the operative word: an Order is never tied to a specific
Chemist Call — it's logged as its own action — and unlike almost every other field-submitted
entity in this system, **nothing here goes through manager approval**.

## What it owns

- **`Order`** — a Stockist/Distributor or Chemist order, itemized via `OrderItem`. Attaches to
  exactly one of `distributor_id`/`chemist_id` (never both, never neither). Lifecycle:
  `PLACED → DONE` or `PLACED → CANCELLED`.
- **`OrderItem`** — one line per product on an order: `product_id`, `quantity`, `unit_price`,
  `amount`.
- **`MonthlyStock`** — one row per (outlet, product, month): `opening_qty`, `closing_qty`, same
  polymorphic distributor/chemist attachment as `Order`.

Full fields, types and the ER diagram: [`../erd/06-sales-and-orders.md`](../erd/06-sales-and-orders.md).

## Public contract

Following the shape in [`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) —
`health.public.ts`'s `HealthPublicContract` is the reference shape. This module's tier-4 slot in
`apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS` is named `sales`, so its contract file is
`sales.public.ts` exporting `SalesPublicContract`.

What it's likely to expose, once built — this module has no consumers yet among the other 9, so
the contract starts narrow and grows on demand (per
[`../engineering/adding-a-module.md`](../engineering/adding-a-module.md)):

- Read-only reporting queries for the Web Portal's Marketing/Sales reports (PRD §6.3, "Gift &
  Sales Reports") — order history and a computed Secondary Sales figure per outlet/product/month.
- Nothing this module needs to expose *inward* is currently identified: no other tier-4 or
  tier-5 module reads Order/MonthlyStock data as an input to its own logic (Marketing's Target
  tracking is against Targets, not against realized Orders — see
  [`marketing.md`](marketing.md)).

## Write-path rules & invariants

- **Exactly one of `distributor_id`/`chemist_id` is set on both `Order` and `MonthlyStock`** — a
  DB-level or application-level XOR check, matching the ERD's stated constraint. Reject a create
  with both or neither set as a `400`, not a silent null-coalesce.
- **`Order.total_amount` is denormalized from its `OrderItem` rows** — application logic keeps it
  in sync on every item add/edit/remove; it is never independently editable.
- **The `PLACED → DONE`/`PLACED → CANCELLED` transition is a completion action, not an approval
  action** — same shape as Field Activity's `DoctorGift` (Admin-issued, MR marks it `DONE`), not
  the Nearest-Manager-then-Admin state machine in
  [`../hld/05-approval-workflow-engine.md`](../hld/05-approval-workflow-engine.md). This module
  does not call into the Approval Workflow Engine at all — say so explicitly in code review when
  someone new to the module assumes it does, since every *other* field-submitted entity in this
  system does.
- **No manager approval on create, ever** — PRD §6.2.B / §5.3.1 both state this plainly. An Order
  or MonthlyStock row is visible and actionable the moment it's written.
- **`MonthlyStock` is one row per (outlet, product, month)** — a second submission for the same
  key is an update, not a new row (see Edge cases).
- **Secondary Sales is never written directly.** It's a derived report:
  `opening_qty + primary sales received during the month − closing_qty`, computed at read time
  from `MonthlyStock` plus that period's `Order` rows for the same outlet/product. This module
  owns the two inputs; it does not persist the derived figure anywhere.
- **Money.** `unit_price`, `amount`, `total_amount` are `decimal` per the ERD — the precision
  convention (`Decimal128` vs. integer-subunit) is not yet decided project-wide; see
  [`../engineering/coding-standards.md#money`](../engineering/coding-standards.md#money). Do not
  introduce a `sales`-specific convention ahead of that decision.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/sales/orders` | MR | Create an Order with its `OrderItem` lines, status `PLACED` |
| `GET` | `/sales/orders` | MR, Admin | List Orders (MR: own; Admin: all/filtered) |
| `GET` | `/sales/orders/:id` | MR, Admin | Order detail with line items |
| `POST` | `/sales/orders/:id/complete` | MR | Transition `PLACED → DONE`, sets `completed_by`/`completed_at` |
| `POST` | `/sales/orders/:id/cancel` | MR | Transition `PLACED → CANCELLED` |
| `POST` | `/sales/monthly-stock` | MR | Record/update opening+closing counts for an outlet/product/month |
| `GET` | `/sales/monthly-stock` | MR, Admin | List stock counts, filterable by outlet/product/month |
| `GET` | `/sales/reports/secondary-sales` | Admin | Derived Secondary Sales figures over a period |

Exact role gating (whether HR/Accountant get any read access here) follows PRD §5's "Sales
managers are explicitly excluded from web-portal workflows" framing — this module's Web Portal
surface, if any beyond Admin reporting, is Admin-only by default until stated otherwise.

## Edge cases

- **Completing or cancelling an Order twice.** The second `POST .../complete` or `.../cancel` on
  an already-`DONE`/`CANCELLED` order is a `409`, not a silent no-op — the caller's assumption
  about current state was wrong and should surface, not be swallowed.
- **Cancelling a `DONE` order.** Not a valid transition (`PLACED → CANCELLED` only) — once
  fulfilled, reversing it is a new business action (a return/adjustment), not a state-machine
  edge this module needs to model in its first build. Reject with a clear message rather than
  silently allowing `DONE → CANCELLED`.
- **A second `MonthlyStock` submission for the same (outlet, product, month).** This is an
  **update** to the existing row, not a duplicate — the write path must look up the existing key
  before insert. Two different MRs submitting for the same key in the same month (e.g., during a
  route handoff) both land on the same row; the second write simply overwrites, and `recorded_by`
  reflects the most recent submitter. If auditability of who-changed-it-when later matters, that's
  an addition to this rule, not a reason to allow duplicate rows now.
- **An Order for a Distributor/Chemist outside the submitting MR's assigned territory or direct
  assignment.** The ERD does not link `Order` back to `RouteAssignment` or `DoctorAssignment` —
  it's intentionally standalone. Whether to gate Order creation by territory coverage (the way
  Field Activity gates calls) is an open product question, not a schema one; the first build
  should **not** silently assume the ERD's lack of a link means "no restriction is wanted" — flag
  it for a product decision before shipping, or gate it and document the choice here once made.
- **Money precision drift between `unit_price × quantity` and `amount`.** Compute `amount`
  server-side from `unit_price` and `quantity` rather than trusting a client-supplied value —
  otherwise a rounding or unit mismatch on the client silently corrupts `total_amount`.

## Dependencies

- **Field Master Data** (Tier 3) — `Distributor`, `Chemist`, `Product` referenced by `Order`/
  `OrderItem`/`MonthlyStock`. This is the load-bearing dependency; see
  [`field-master-data.md`](field-master-data.md).
- **Identity** (Tier 1) — the submitting/completing `User` (`user_id`, `completed_by`,
  `recorded_by`). A lighter dependency than Field Master Data's — no assignment or hierarchy
  logic is consumed, just the user reference itself.

Not a dependency: the Approval Workflow Engine, Offline Sync & Geofencing (Orders/stock counts
are not stated as geofenced the way Doctor/Chemist Calls are in PRD §5.1 — they're captured, not
location-verified).

## Deliberately deferred

- **Return/adjustment handling for a `DONE` order.** Out of scope for the first build; see the
  cancel-after-done edge case above.
- **Territory/assignment gating on Order creation.** Genuinely open — see Edge cases.
- **Any auditing of `MonthlyStock` overwrites** beyond `recorded_by`/`recorded_at` reflecting the
  latest write.
- **The Secondary Sales computation's exact formula and edge handling** (multiple orders in a
  month, a month with no opening count on file) is a reporting-layer concern to nail down when
  the Web Portal's Sales report screen ([`../roadmap.md`](../roadmap.md) phase 9) is actually
  built, not before there's a consumer for it.
