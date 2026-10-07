# 6 · Money

| Id | Do | Expect | Result |
|---|---|---|---|
| 6.01 | Attendance: month calendar for Promo Mr One, September | each day one of: present, absent, leave, holiday, weekly off, strike, not yet, before joining (K25); today never absent | |
| 6.02 | Attendance: payroll calendar | absent days counted match payroll's absent column | |
| 6.03 | Payroll → September | 3 drafts, base ₹92,000.00, net ₹88,000.00 (see test-data.md) | |
| 6.04 | Absent deduction | Promo Mr One 1 d → −₹1,000.00 (base ÷ 30) | |
| 6.05 | Details for a run | base, leave deduction, absent deduction, net add up; slip shows earnings lines | |
| 6.06 | Turn `ABSENT_DEDUCTS_SALARY` off, Regenerate drafts | absent deductions become 0 | |
| 6.07 | Turn it back on, regenerate | the figures return | |
| 6.08 | Strike day (if one exists) | not deducted unless `STRIKE_DEDUCTS_SALARY` on (K26) | |
| 6.09 | Finalize one draft | becomes Finalized, cannot be regenerated; the employee's leave in that month is locked (K12) | |
| 6.10 | Download CSV | file opens and matches the table | |
| 6.11 | A past financial year | read-only; generate / finalize disabled | |
| 6.12 | Expenses and Expense payouts | accepted claims listed; payout on the 15th is separate from salary (K5) | |
| 6.13 | Accountant can do 6.03–6.12 except what is Admin-only | per the role table | |
