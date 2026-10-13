# Test data

## The sample set
Written by `pnpm --filter @greynote/api seed:sample-sales -- --apply` (dry run without `--apply`; `-- --remove` takes it all away). It refuses to run in production. Everything it creates is labelled: names start with **SAMPLE**, orders say **SAMPLE DATA**.

| What | Sample content |
|---|---|
| Employees | three MRs: **Promo Mr One** (PROMOMR1), **Promo Mr Two** (PROMOMR2), **Promo Mr Three** (PROMOMR3) — base salary ₹30,000 / ₹34,000 / ₹28,000 a month |
| Distributors / chemists | 3 distributors, 4 chemists |
| Products | 3 sample products with PTS / PTR / MRP, plus the existing XYZ-500 |
| Sales | ~6 months of orders (mostly Done, some Placed, a few Cancelled); monthly stock counts that follow from them |
| Field | 36 doctors with assignments, calls and follow-ups; daily reports (369 over the year, six submitted and waiting); accepted TA / DA / meal claims; route assignments |
| Payroll | finalized runs for April onward, September in **Draft** |

## Figures to check against (from the browser passes, 2026-10-07)
- Approvals: All · 6, Daily report · 6 (six submitted sample reports).
- Payroll, September 2026 (drafts): 3 employees, base ₹92,000.00, leave deductions shown ₹4,000.00 (unpaid leave + absent), net ₹88,000.00. Promo Mr One net ₹29,000.00; Two ₹32,866.67; Three ₹26,133.33.
- Salary report, April: base ₹92,000.00, deductions ₹4,333.33, net ₹87,666.67, employer 12% ₹11,040.00, cost to company ₹98,706.67. Year finalized net ₹4,34,733.34 + employer ₹55,200.00 = ₹4,89,933.34.
- DCR report: 353 reported days, 7.6 calls per reported day, 9% late, 220 calls geofence-unconfirmed. Promo Mr One called 11 of 12 assigned doctors in September.

If a figure differs, first check the date: absent-day and "today" figures move with the calendar. Say so in the defect.

## Logins
The Admin you created with `pnpm --filter @greynote/api seed`. Create an HR and an Accountant user yourself in case 1 (people → employees → add); note their codes here (never passwords): HR = ______, Accountant = ______.

## Demo logins for the Google Play reviewers
`DEMO_MANAGER_PASSWORD='…' pnpm --filter @greynote/api seed:demo-manager` creates DEMOMGR (manager) with DEMOMR1, DEMOMR2 and DEMOMR3 (re-running adds only what is missing), a demo zone/HQ/route and six doctors; `-- --remove` deletes them, `-- --reset-password` changes the password. Safe in production: demo users are left out of payroll, attendance and the daily jobs, skip device approval at login. They can be deleted: DEMOMR1 is the Play reviewer's login, DEMOMR2 is for our own testing, DEMOMR3 is the one the reviewer deletes. To restore one, run `-- --remove` then the seed again with the same password. In production the demo accounts are created by `seed-production` (manual_deploy Step 8a). The password is given to Play Console's "App access" form and never written here.

## Resetting
`-- --remove` then `-- --apply` returns the sample set to its generated state. Real records you added by hand are not touched.
