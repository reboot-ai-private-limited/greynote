# Team test guide: log in as Demo RSM and click through everything

Local database only (see [`local-test-data.md`](local-test-data.md) for the logins, all `admin123`). Phone app in a browser: `http://localhost:8081`. Send me bugs as "screen · account · what I did · what I saw"; they go into [`defects.md`](defects.md).

## One-time setup (already done once on this machine)

```bash
docker compose -f docker-compose.local.yml up -d         # Mongo, now a ONE-MEMBER REPLICA SET (see below)
pnpm --filter @greynote/api dev:local                    # the API on :3100 (restart it after the compose file changed)
DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:local-test -- --apply    # the test world; also gives the demo people their Pay Band
DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:team-demo -- --apply     # the things to approve (this guide)
```

- **Mongo must be a replica set.** Submitting and approving use transactions; a plain mongod answers every submit with a 500 ("Transaction numbers are only allowed on a replica set member"). `apps/api/.env.local` uses `MONGO_URI=mongodb://127.0.0.1:27018/greynotenew?directConnection=true`.
- `seed:team-demo` logs in as the demo people and uses the **real API**, so a flow that is broken shows up as a refusal at the end of its output. It is safe to run again. Take a backup first (`docker exec greynote-local mongodump --db greynotenew --archive --gzip > ~/backups/x.archive.gz`); to start over, restore it.
- **Cloudinary is not set up locally**, so nothing that stores a file works: secondary-sales proof files (so secondary cannot be *sent*: its figures stay saved as drafts) and visual uploads. Add `CLOUDINARY_*` to `apps/api/.env.local` to try them.
- Expense months (TA/DA) are not seeded.

## What is waiting for whom

| Login | Team → Approvals shows |
|---|---|
| **DEMORSM** | Tour Plans of `DEMOMRR1` and `DEMOASM`; Leave of `DEMOMRR1` and `DEMOASM`; Doctor services of `DEMOMRR1` (tour package) and `DEMOASM` (team doctor); a new doctor and a new chemist from `DEMOMRR1`; a Daily Plan of `DEMOASM2` |
| **DEMOASM** | Tour Plan of `DEMOMRA1`; Leave of `DEMOMRA1`; a new chemist from `DEMOMRA1`; a Daily Plan |
| **DEMOZSM** | nothing until the RSM sends something up |

Already decided, for history and the filters: `DEMOMRR2`'s December plan, leave, service and new doctor approved; `DEMOMRA2`'s plan, leave and new doctor rejected with a reason. Daily reports are not in the approvals list: they are reviewed under Team → Reports → Daily reports (`DEMOMRR1` and `DEMOMRA1` sent today's; `DEMOMRR2` has calls but has not sent).

## Walk through (Team tab, as DEMORSM)

1. **Approvals:** open each row, read the detail, **approve** some, **reject** one with a reason, and check the row leaves the list and the history shows it. Try the bulk select.
2. **Team** (was People): the tree (`DEMOASM` → MRs). Open a person: today, plans, reports, leave, doctors, targets.
3. **Reports:** Today board, Plans, Daily reports (open `DEMOMRR1`'s: calls, follow-up, geofence), Monthly overview, Leave calendar, Orders, Stock & secondary, Team chemists/distributors/Territory, Late exceptions, Unblock.
4. Outside the Team tab: **Orders** (own + team, filter), **Gifts** (team gifts, done and not done), **Services** (stage filter), **Leave**, **Targets** (tree; the final figure and "waiting"), **Visit targets**, **Doctors / Chemists** (the team's, 20 at a time), **Visuals** (pick a team doctor, add, take one off).
5. Log in as **DEMOASM** and approve what is waiting there, then as **DEMORSM** again: does anything of the ASM's arrive?
6. Log in as **DEMOMRR1** (an MR): the same data from the MR's side: plans, today's calls, orders, leave, services; check an MR sees no Team tab.
