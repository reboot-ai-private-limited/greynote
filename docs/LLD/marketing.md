# Marketing

Visuals (e-detailing content), Campaigns, and Targets (PRD §6.2.B, ERD
[Module 8](../erd/08-marketing.md)) — the module behind the mobile app's "Marketing" home-tab
quadrant and a manager's target-vs-achieved reporting.

## What it owns

- **`Visual`** — e-detailing content, optionally tied to a `Product` (nullable FK — general/
  branding visuals have no single product behind them), uploaded by Admin.
- **`Campaign`** — company-wide, no Zone/HQ scoping. Every active campaign is visible to every
  field worker; there is no `CampaignZone`/`CampaignHQ` join table the way `Holiday` (Module 7)
  has one.
- **`Target`** — per `User` per month, optionally narrowed by `Product` and/or `Campaign` (both
  nullable FKs). One shape covers a general monthly target, a product-specific target, and a
  campaign-tied target.

Full fields: [`../erd/08-marketing.md`](../erd/08-marketing.md).

**No approval workflow.** Visuals and Campaigns are Admin-authored; Targets are set by Admin or a
manager for someone in their reporting line. None of the three is submitted-for-approval —
Marketing does not call the [Approval Workflow Engine](../hld/05-approval-workflow-engine.md) at
all, unlike Planning or Field Activity.

## Public contract

Following the `.public.ts` pattern in
[`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) (shape:
`apps/api/src/modules/health/health.public.ts`), `MarketingPublicContract` exposes read access to
active Visuals/Campaigns for the mobile app's Marketing tab, and a Target-rollup read for the
Team tab / manager dashboard. It does not need to expose a write surface to other modules — every
write to `Visual`/`Campaign`/`Target` originates from Marketing's own `interface/` layer (Admin
or manager actions), not from another module reacting to something.

## Write-path rules & invariants

- **`Visual.product_id` and `Target.product_id`/`campaign_id` are independently nullable** — a
  write validates a non-null FK resolves via Field Master Data's (Product) or this module's own
  (Campaign) contract, but never requires one.
- **One `Target` per `(user_id, month, product_id, campaign_id)`** — decided 2026-09-30 (the ERD was silent).
  A unique index enforces it (a missing product or campaign is stored as an explicit `null`, so "none" is one value),
  and `POST /targets` for an existing key **replaces** the amount and records who set it last, so a repeat can never
  double-count in the rollup. Two first-time sets racing to insert are safe: the loser retries into an update.
- **`Target.created_by`** — the ERD notes "Admin or manager who set it." A manager setting a
  Target is presumably limited to their own reports (mirroring the approval engine's
  nearest-manager scoping elsewhere), but Marketing has no approval engine to inherit that check
  from — this module's own write path must enforce "a manager can only set a Target for someone
  in their downline" itself, via Identity's downline contract (see below).
- **What "achieved" counts** (decided 2026-09-30): orders by the user and their downline dated in the month, `PLACED`
  and `DONE` alike, `CANCELLED` left out. A product narrows both sides — its targets, and only its order lines. No
  product/campaign asks for the *general* target and *all* sales (the filters are exact, never "any"). Orders carry
  no Campaign, so a campaign-tied target counts only orders dated within the campaign's start–end inside that month;
  a campaign that misses the month entirely counts nothing.
- **`achieved_amount` is never stored.** Per the ERD's explicit decision: it's derived by
  aggregating `OrderItem` rows (Sales & Orders, Module 6) for the matching user/month/product,
  computed at read time — never a column that can drift out of sync with the orders it's summing.

## Target rollup

Full design: [`../hld/08-target-rollup.md`](../hld/08-target-rollup.md). Summary at LLD depth:

A manager's **effective target** for a month (± product/campaign filter) is their own `Target`
row, if any, plus the sum of every `Target` row belonging to their downline. The downline walk
reuses Identity's `contract.getDownline(managerId)` — the same `$graphLookup` built for the
Approval Engine's read-only-visibility rule (HLD 5) — flattening direct and indirect reports into
one set, since rollup doesn't need the distinction the approval engine cares about. The achieved
side sums `OrderItem` amounts for `{managerId} ∪ downlineIds` over the same scope, via Sales &
Orders' contract.

**Computed live, not cached or materialized**, same reasoning as HLD 5's read-only visibility:
the hierarchy is shallow (≤5 levels) and a sum over a handful of rows is cheap. HLD 8 flags a
nightly-materialized cache as the escape hatch if a Target dashboard's check-frequency ever makes
this a real load concern — not needed at first build.

### The Sales dependency: resolved by tiering (2026-09-29)

`hld/08-target-rollup.md` has Marketing call **Sales & Orders'** `contract.sumOrderAmount(...)`
directly, but the tier graph forbids a same-tier import, and `sales` and `marketing` were both in
Tier 4. **Decision: `marketing` moves up to Tier 5, beside `payroll`** (`MODULE_TIERS` in
`apps/api/.dependency-cruiser.cjs`; `../decision-log.md`, 2026-09-29). Checked before moving it:
Sales & Orders depends on nothing in Marketing (an Order carries no Campaign or Target), and Payroll
depends on nothing in Marketing, so the two share a tier without touching. Marketing may now import
Identity (the downline), Field Master Data (Products) and Sales & Orders (order totals) through their
`.public.ts` contracts, exactly as the HLD draws it. The other two options — a read model Sales
publishes, or a reporting layer above both — were rejected as machinery the fix doesn't need.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/marketing/visuals` | Admin | Upload a Visual — multipart: `file` (image — PNG, JPG, WebP or GIF, ≤ 25 MB) plus `title`, `category`, optional `productId` |
| `GET` | `/api/marketing/visuals` | Admin, FIELD | List active Visuals, optionally filtered by product |
| `PATCH` | `/api/marketing/visuals/:id` | Admin | Change title, category or product, or set status (active/inactive); send at least one |
| `GET` | `/api/marketing/doctors/:doctorId/visuals` | Admin, FIELD | The Visuals picked for a Doctor, with `canRemove` — the Doctor's MR, a manager above them, or Admin |
| `POST` | `/api/marketing/doctors/:doctorId/visuals` | Admin, FIELD | Add Visuals (`{ visualIds }`), add-only and idempotent; returns the list as it now stands |
| `DELETE` | `/api/marketing/doctors/:doctorId/visuals/:visualId` | Admin, FIELD | Take one off — Admin, or a manager above the Doctor's MR; the MR gets 403 |
| `POST` | `/api/marketing/campaigns` | Admin | Create a Campaign |
| `GET` | `/api/marketing/campaigns` | Admin, FIELD | List Campaigns, optionally filtered by status |
| `PATCH` | `/api/marketing/campaigns/:id` | Admin | Update status (active/inactive/completed) |
| `POST` | `/api/marketing/targets` | Admin, manager (FIELD) | Set a Target for self or a downline member |
| `GET` | `/api/marketing/targets/:userId?month=&productId=&campaignId=` | Admin, manager (FIELD, own downline), self | Own + downline target, and achieved, for a month |

**As built (2026-09-30):** Visual files go to Cloudinary through `shared/storage/cloudinary.ts` (also used by Identity's
documents; configured only when an upload happens). The file is stored first and taken back out if the row cannot be
written; a file Cloudinary cannot read is a `400`, not a `500`. Field staff always get only `active` Visuals and
Campaigns (the status filter is Admin's). Only an Admin or a *manager* (a FIELD user with people below them) sets
Targets — for themselves and their downline at any depth; an MR without a team cannot set even their own, and may
only read it. A Target's subject must be an active FIELD employee. Not built: a per-member breakdown of a manager's
rollup, and editing a Campaign's name or dates (status only, as specified).

**As built (2026-10-10), doctor visuals:** `DoctorVisual` rows are unique per (doctor, visual); `addMany` reactivates a removed row and
leaves an existing one (and its first adder) untouched. Access: Admin always; the Doctor's assigned MR may list and add; a manager
(the assigned MR is in their downline) may also remove; anyone else gets 403 (`NOT_YOUR_TEAM`), an MR removing gets 403
(`ONLY_MANAGER_REMOVES`). Marketing reads the Doctor side through `getDoctor`, `isAssignedToDoctor` and `getAssignedUserId` of
Field Master Data's public contract. Adding an inactive or unknown Visual is `404 VISUAL_NOT_FOUND`; the whole call is refused.
A Visual deactivated later is hidden from the MR and shown, with its status, to Admin and managers.

## Edge cases

- **A manager's rollup when a downline member has no Target set.** That member contributes `0`
  to the sum, not an error and not an exclusion — the rollup is a sum over whatever rows exist,
  not a completeness check.
- **A `Target` scoped to a `Product` that's later discontinued/deactivated in Field Master Data.**
  The Target row and its historical `achieved_amount` computation must keep resolving against
  past `OrderItem` rows for that product — deactivating a Product must not make past Targets
  un-renderable. Validate the FK on write, not on every read.
- **A `Visual` with no `Product` tie.** Renders in the general/company-wide section of the
  Visuals list rather than being excluded — this is the documented purpose of the nullable FK,
  not a degraded case.
- **A downline walk during an org change.** If a manager's `manager_id` chain changes mid-month
  (a transfer), the rollup reflects the **current** hierarchy at read time, not the hierarchy as
  of when a Target was set — consistent with "computed live, not cached."

## Dependencies

- **Identity** (Tier 1) — `contract.getDownline(managerId)` for rollup, and resolving
  `Target.user_id`/`created_by` against real users.
- **Field Master Data** (Tier 3) — resolving `Visual.product_id`/`Target.product_id` against real
  Products.
- **Sales & Orders** (Tier 4) — `achieved_amount` aggregation from `OrderItem`, through Sales' contract.

## Deliberately deferred

- Regional/Zone-scoped campaigns (`CampaignZone`/`CampaignHQ`-style join table) — explicitly
  ruled out for the first build by the ERD; revisit only if a real requirement appears.
- A materialized/cached rollup — the live query is the first build; the nightly-cache escape
  hatch from HLD 8 is not built unless load actually demands it.
- Any notion of a Target "status" (met/missed) beyond rendering `effective_target` alongside
  `achieved_amount` — PRD doesn't ask for a stored verdict, only the two numbers.

## Achievement (2026-10-09)

`Achievement { userId, month, achievedAmountPaise, enteredBy, createdAt, updatedAt }`, unique on `(userId, month)`; zero is a real figure. `POST /api/marketing/achievements` `{ userId, month, achievedAmountPaise }` — Admin for any active FIELD employee, a manager for their downline (not themselves); replaces the month's figure. Marketing's contract adds `listMonthFigures(userIds, month)` (the general target and the entered achievement of each user, `null` where unset), which the Sales Dashboard reads. **Both targets and achievements are refused for a month outside the current financial year** (`OUTSIDE_FINANCIAL_YEAR`) or in a closed one (`FY_CLOSED`). The target summary's derived `achievedPaise` is unchanged (decision-log 2026-10-09).

## Targets over month ranges; achievement from Sales (2026-10-10)

`Target` gains `toMonth` (`month` is the first): unique on `(userId, month, toMonth, productId, campaignId)`; both ends must be months of the **current** financial year and open (`assertMonthInCurrentFinancialYear` for each), `toMonth ≥ month`. `targetShare(target, window)` (`domain/targetRange.ts`) spreads the amount evenly over the target's months and returns the part inside a window. `POST /api/marketing/targets` `{ userId, month, toMonth?, productId?, targetAmountPaise }`, `GET /api/marketing/targets?userId&from&to` (each with its share), `DELETE /api/marketing/targets/:id` — Admin for anyone, a manager for self and downline. The contract's `listMonthFigures` becomes `listTargetShares(userIds, fromMonth, toMonth)`. The **Achievement section above is superseded**: the route, use cases and port are removed; achievement is the employee's secondary (Sales `EmployeeSale`), computed by Reports. The rollup (`GetTargetSummaryUseCase`) counts each target's share of the month.

## Targets in units; manager edits to a doctor's visuals (2026-10-12)

`Target.targetQty` (nullable): `POST /marketing/targets` takes `targetAmountPaise` **or** `targetQty` (units need a product; a product with no PTR takes amounts only). With units the amount is `targetQty × ptr`; with an amount the units are `round(amount ÷ ptr)`. `listTargetShares` returns `qty` and `shareQty`; the employee report's per-target rows add `targetQty`, `achievedQty` and `achievementQtyPercent`. Achievement counts approved secondary only (see sales-and-orders.md). Visuals: the MR only adds to a doctor's list; a manager above the MR or Admin can add and remove (`canRemove`).

## A manager has no target of their own (2026-10-14)

A manager (designation above MR) has no target: it is the sum of the MRs in their downline, worked out by Reports (decision-log 2026-10-14). `SetTargetUseCase` refuses a target for a manager (`400`: set it on the MRs); `ListTargetsUseCase` returns `[]` for one; `GetTargetSummaryUseCase` leaves out targets belonging to managers (own and in the downline), so an old manager target cannot double a total. Nothing is deleted: `pnpm --filter @greynote/api report:manager-targets` lists the ignored rows. `UserDirectoryPort` gains `getDesignationLevels`.
