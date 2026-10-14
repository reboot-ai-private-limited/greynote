# 2 · Setup (before anything else is entered)

| Id | Do | Expect | Result |
|---|---|---|---|
| 2.01 | Designations: add, rename, deactivate one | list updates; a designation in use cannot be removed (or is only deactivated) | |
| 2.02 | Pay grades: add a grade | it holds **no** CTC range (K10) | |
| 2.03 | Pay components: view the formula (Admin, HR, Accountant) | earnings and deductions listed; Professional Tax shows a Mandatory lock and cannot be switched off; Accountant sees but cannot edit | |
| 2.04 | Pay components: add or change one as Admin | saved; shows on a CTC set afterwards | |
| 2.05 | System settings: change `CTC_JUMP_WARN_PERCENT`; save | saved, with the old value shown in history if any | |
| 2.06 | System settings: `ABSENT_DEDUCTS_SALARY` and `STRIKE_DEDUCTS_SALARY` | present with defaults on / off (K20, K26) | |
| 2.07 | Settings: `TA_MAX_KM`, `EX_STATION_MIN_KM` present (K1, K2) | present with the defaults 99 and 15 | |
| 2.08 | Financial year: Close year for a **test** year only if one exists; otherwise skip | closing makes that year read-only; Reopen undoes it (K8) | |
| 2.09 | Financial-year switch in the top bar | "Current" and earlier years; a past year shows read-only | |
