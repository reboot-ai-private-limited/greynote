# Manual testing — start here

You test the system by hand, one area at a time, in the order below. Each area has a checklist: do the steps, compare with **Expect**, mark Pass / Fail. Anything that fails goes in [`defects.md`](defects.md). Each finished pass is summed up in a run report (template at the bottom of `defects.md`).

## Order (each area relies on the ones before it)

| # | File | What it proves | Needs a phone? |
|---|---|---|---|
| 0 | [00-environment.md](00-environment.md) | the system starts and sample data is in place | no |
| 1 | [01-access-roles.md](01-access-roles.md) | login, devices, who sees what (Admin / HR / Accountant) | no |
| 2 | [02-setup.md](02-setup.md) | designations, pay grades, pay components, settings, financial-year close | no |
| 3 | [03-master-data.md](03-master-data.md) | zones, HQs, routes, doctors, distributors, chemists, products | no |
| 4 | [04-people.md](04-people.md) | employees, CTC, leave & holidays, promotions | no |
| 5 | 05-field-loop (written with Step 6) | plans, daily reports, calls, expenses, approvals raised by the field | **yes — the Step 6 web simulator** |
| 6 | [06-money.md](06-money.md) | attendance, payroll, expense payouts, leave lock | no (uses sample data) |
| 7 | [07-sales.md](07-sales.md) | orders page, stock counts, primary / secondary | orders are raised on the phone; the page itself no |
| 8 | [08-reports.md](08-reports.md) | the five reports and their CSVs, financial-year switching | no |
| 9 | [09-cross-cutting.md](09-cross-cutting.md) | financial-year read-only, navigation, sessions, errors | no |

Areas 5 and the phone parts of 7 wait for Step 6 (the web simulator); the rest can be tested today.

## How to mark a case
- **Pass** — what you see matches **Expect** exactly (figures to the paisa).
- **Fail** — anything else. Write one line in `defects.md`: the case id, what you did, what you saw, what you expected, a screenshot name.
- **Blocked** — a step earlier failed, so this one cannot be tried. Note which.
- **Skip** — not applicable now (say why).

Case ids are `area.number`, e.g. `3.07`. Keep them stable; [`traceability.md`](traceability.md) links the client decisions (K-rows in `client-sign-off.md`) to the cases that prove them.

## Ground rules
- Use the sample data (see [`test-data.md`](test-data.md)). Do not test on production.
- Do one role at a time; log out between roles.
- Finalizing payroll, closing a financial year and removing sample data are one-way for that data: the checklists say when to take care.
- Do not run `pnpm check` while the servers are up (it edits the mobile app's package files).

## Automated checks that back this up
`pnpm --filter @greynote/api test` (API, including the role-by-route table in `src/rbac.routes.test.ts`) and `pnpm --filter @greynote/web test`. Run them before a test pass; if they fail, fix before you start clicking.
