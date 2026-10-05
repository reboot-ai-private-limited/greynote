# HLD 7: Payroll Generation Flow

How the Accountant's `PayrollRun` (ERD Module 9) actually gets generated and finalized.

## 1. Generation flow

```mermaid
sequenceDiagram
    participant Acct as Accountant
    participant Payroll as Payroll Module
    participant Identity as Identity Module
    participant FA as Field Activity Module
    participant HR as HR Ops Module
    participant DB as MongoDB

    Acct->>Payroll: Generate for {month, user_ids or "all FIELD"}
    loop per user
        Payroll->>Identity: contract.getUser(user_id) -> pay_band
        Payroll->>FA: contract.getPaidTaDaTotal(user_id, month)
        FA-->>Payroll: { ta, da, reimbursement } (PAID only)
        Payroll->>HR: contract.sumUnpaidLeaveDays(user_id, month)
        HR-->>Payroll: unpaid_days
        Payroll->>Payroll: leave_deduction_paise = round_half_up(unpaid_days x base_salary_paise / 30)
        Payroll->>Payroll: net_payable_paise = base_salary_paise + total_ta_da_paise + reimbursement_paise - leave_deduction_paise
        Payroll->>DB: upsert PayrollRun (status=DRAFT)
    end
    Payroll-->>Acct: Computed sheet per user, for review
```

- **Bulk-capable:** Accountant can generate for one user or the whole FIELD workforce for a month in one action — each user gets their own `PayrollRun` row, computed independently.
- **Salary is the monthly gross of the CTC in force for the month** (earning lines of the CTC, i.e. CTC less employer EPF/ESI, ÷ 12; decision-log 2026-10-05). **Leave deduction rate: `base_salary / 30`, flat**, regardless of the actual calendar month length or working-day count. This is deliberately the simplest of three options considered (vs. actual calendar days, vs. actual working days excluding Sundays/Holidays) — matches common payroll practice and avoids pulling Module 7's Holiday/weekly-off data into every payroll calculation.
- **`reimbursement_paise`** (added 2026-09-29) is the month's `PAID` *manual* expenses — travel, meals, other — shown apart from TA/DA and added to the net pay. `total_ta_da` is TA + DA only.
- **The month is the month an expense was *paid*** (2026-09-30), not the month it was reported: `getPaidTaDaTotal(user, month)` counts what the Accountant marked paid during `month`. An expense reported in September and paid on 3 October therefore goes into October's run, so a payment after September was finalized is never lost.
- **Only months that have ended can be generated**, and a mid-month joiner is paid the full `base_salary` with `joined_in_month` flagged for the Accountant (no proration until the client gives a rule).
- **`total_ta_da` only counts `PAID` expenses** (HLD 6 / Module 4's `payment_status`) — an approved-but-unpaid TA/DA claim doesn't count toward this month's payroll yet, same rule already locked in Module 9's ERD.

## 2. Idempotency and the Draft -> Finalized lock

- Generating again for a user+month that already has a `DRAFT` `PayrollRun` **recomputes and overwrites it** — nothing is locked in yet, so Accountant can regenerate freely while reviewing (e.g. after catching and fixing a missed unpaid-expense mark).
- Generating for a user+month that's already `FINALIZED` is **rejected** — per Module 9's design decision, a finalized run is a locked historical record. If a real correction is needed after finalization, that's a manual adjustment process (out of scope for this HLD — not something the generation flow itself handles).
- **Finalizing** (`POST /payroll/{id}/finalize`) sets `status = FINALIZED` and stamps `finalized_at`. From that point, the row's `base_salary`, `total_ta_da`, `leave_deduction`, and `net_payable` are frozen, even if the underlying `Expense`/`Leave` data for that month changes afterward.

## Next

This is HLD topic 7. See `README.md` for the index.
