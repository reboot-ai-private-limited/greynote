# Payroll

The Accountant's final step for a field employee's month: turn that month's Pay Band, paid
TA/DA, and unpaid-leave days into one locked `PayrollRun` row (PRD §5.3, glossary "PAYROLL").
Tier 5 — the top of `apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS` — so this module may
import from Identity, Territory, Field Master Data, Planning, HR, Field Activity, Sales and
Marketing, but nothing may import from it. It is the aggregation of everything else, which is
why [`../roadmap.md`](../roadmap.md) builds it last.

**Payroll is FIELD-role only.** `PayBand` — and therefore `base_salary` — only exists for FIELD
users (`../erd/01-identity-hierarchy.md`). Admin/HR/Accountant compensation is handled by a
separate, external company payroll system entirely outside this platform. This module never
computes a non-FIELD salary; there is no `PayrollRun` row for anyone else, by construction, not
by a filter someone could forget.

## What it owns

**`PayrollRun`** — one row per FIELD user per month. Full field list:
[`../erd/09-payroll.md`](../erd/09-payroll.md). The fields that drive every rule below:

| Field | Meaning |
|---|---|
| `base_salary` | **Snapshot** of `PayBand.base_salary` at generation time |
| `total_ta_da` | Sum of that month's `PAID` `TA` and `DA` `Expense` rows (Field Activity's `getPaidTaDaTotal`) |
| `reimbursement` | Sum of that month's `PAID` manual `Expense` rows — travel, meals, other — from the same call |
| `leave_deduction_paise` | `unpaid_days × base_salary_paise / 30`, rounded half up to a whole paise once — computed at generation, then frozen as one number |
| `net_payable` | `base_salary + total_ta_da + reimbursement − leave_deduction` |
| `status` | `DRAFT` → `FINALIZED` |
| `generated_by` / `generated_at`, `finalized_at` | Accountant, and when |

Nothing else. The detailed leave ledger stays in HR's own collection; `leave_deduction` here is
a single derived number, not a duplicated breakdown.

## Public contract

Narrow, matching the pattern every module's `<module>.public.ts` follows
([`../engineering/module-anatomy.md`](../engineering/module-anatomy.md) — see
`apps/api/src/modules/health/health.public.ts` for the minimal real example). Nothing sits above
Payroll in the tier graph, so `PayrollPublicContract` exists for the module's own
`interface/` layer and any future reporting surface, not for another module to call:

```ts
export interface PayrollPublicContract {
  generate(input: { month: string; userIds?: string[] }): Promise<PayrollRun[]>;
  finalize(payrollRunId: string): Promise<PayrollRun>;
  get(payrollRunId: string): Promise<PayrollRun>;
  list(filter: { month?: string; userId?: string; status?: 'DRAFT' | 'FINALIZED' }): Promise<PayrollRun[]>;
}
```

`generate` is the one method that reaches across modules — via their own `.public.ts` contracts,
never their internals — to pull `PayBand.base_salary` (Identity), the month's paid TA/DA sum
(Field Activity), and unpaid-leave days (HR).

## Write-path rules & invariants

- **`base_salary` is snapshotted, never re-read.** If a Pay Band's `base_salary` changes next
  quarter, every already-generated `PayrollRun` for prior months must still reflect what was
  actually computed at the time — a live join to `PayBand` would silently rewrite history the
  moment HR edits a grade.
- **`total_ta_da` counts only `PAID` expenses.** An approved-but-not-yet-marked-paid TA/DA claim
  does not count. This is the actual link between the Accountant's two PRD §5.3 responsibilities:
  marking expenses paid (Field Activity) has to happen before payroll generation reads the
  result — not the other way around, and not concurrently for the same month in a way that could
  race.
- **`leave_deduction_paise = round_half_up(unpaid_days × base_salary_paise / 30)`**, flat — not actual calendar days, not
  working days net of Sundays/Holidays. Deliberately the simplest of the options HLD 7 considered;
  do not "improve" this into a calendar-aware formula without a decision recorded in
  [`../decision-log.md`](../decision-log.md) first, since every already-generated run's number
  was computed the simple way.
- **`Draft → Finalized` is a one-way lock.** Regenerating a `DRAFT` run for the same user+month
  recomputes and overwrites it freely (the Accountant is expected to iterate while reviewing).
  Regenerating a `FINALIZED` run is **rejected outright** — a finalized row is a locked historical
  record. A later edit to that month's `Expense` or `Leave` data must never retroactively change
  it; the frozen `base_salary`/`total_ta_da`/`leave_deduction`/`net_payable` are the whole point
  of finalizing.
- **Only the Accountant generates or finalizes.** HR has no write access to this module — PRD
  §5.3 draws that line explicitly, and it is enforced the same way every role check in this
  system is: at the `interface/` layer, before a use case runs.

## Generation flow

Summarized at LLD depth; the full sequence (per-user loop, exact contract calls) is
[`../hld/07-payroll-generation.md`](../hld/07-payroll-generation.md) — read that before
implementing, this section is not a substitute for it.

For each requested user (one, or every FIELD user for the month — **bulk-capable**, each user
gets their own independently computed row): fetch `PayBand.base_salary` via Identity's contract,
sum that month's `PAID` TA/DA Expenses via Field Activity's contract, sum that month's unpaid
leave days via HR's contract, compute `leave_deduction` and `net_payable`, upsert the
`PayrollRun` as `DRAFT`. The Accountant reviews the computed sheet, regenerates if something
looks wrong (e.g. an expense not yet marked paid), then finalizes.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/payroll/generate` | Accountant | `{ month, userIds? }` → generates/overwrites `DRAFT` rows |
| `POST` | `/payroll/:id/finalize` | Accountant | `DRAFT → FINALIZED`, stamps `finalized_at`; rejected if already `FINALIZED` |
| `GET` | `/payroll/:id` | Accountant | One run |
| `GET` | `/payroll` | Accountant | List, filterable by `month` / `userId` / `status` |

No MR/manager-facing endpoint in this module — a field employee's own payslip view, if the PRD
ends up wanting one, is a read surface over this data and can be added to the contract without
touching the write path.

## Edge cases

- **Regenerating an already-`FINALIZED` run** — reject with a clear error (`409`-shaped,
  `AppError.conflict`), not a silent no-op and not an overwrite. The Accountant needs to know the
  regenerate didn't happen, since the whole point of finalizing is that it can't.
- **Generating for a month with expenses still pending manager approval** — those rows are
  neither `PAID` nor countable, so they simply don't contribute to `total_ta_da` yet. This is
  correct, not a bug: `total_ta_da` only ever reflects `PAID` expenses at generation time. The
  Accountant sees a lower number and can defer finalizing until the missing expenses are marked
  paid, or generate now and regenerate later — both are legal on a `DRAFT`.
- **An employee promoted or re-graded mid-month** — `base_salary` is whatever `PayBand.base_salary`
  resolves to for the user **at generation time**. A grade change mid-month is not prorated by
  this module; if that's a real requirement, it needs an explicit decision (proration rule) before
  implementation, not an assumption baked in silently.
- **Zero TA/DA activity for the month** — `total_ta_da = 0` is a completely valid, common case
  (an MR who filed no reimbursable expenses that month), not an error state.
- **A user with no `PayBand`** (shouldn't happen for a FIELD user per Identity's invariants, but
  the generation flow must handle it explicitly rather than crash) — skip with a reported reason
  per-user in the bulk-generate response, don't fail the whole batch.

## Dependencies

- **Identity** — `PayBand.base_salary` per user, read-only.
- **HR** — unpaid-leave day count for the user+month, read-only.
- **Field Activity** — sum of `PAID` TA/DA `Expense` rows for the user+month, read-only.

Payroll depends on all three through their `.public.ts` contracts only — never their Mongoose
models directly, per
[`../engineering/boundaries-and-enforcement.md`](../engineering/boundaries-and-enforcement.md).

## Deliberately deferred

- **Post-finalization correction/adjustment process.** HLD 7 explicitly calls this out of scope
  for the generation flow itself — a real correction after finalizing is a manual process to be
  designed separately, not a code path this module implements on day one.
- **A field-employee-facing payslip view.** Nothing in PRD §6 (Mobile App Features) currently asks
  for one; if it's added later it's a read-only addition to the public contract, not a rework.
- **Calendar-aware or working-day-aware leave deduction.** The flat `/30` rate is deliberate and
  simple; revisiting it is a decision for `../decision-log.md`, not a silent refinement.
