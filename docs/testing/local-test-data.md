# Local test data: logins and what to try

For testing "managers see what their team holds" and route-first planning (decision-log 2026-11-16 and 2026-11-17) on your own machine. **Local database only**: the seed refuses any other `MONGO_URI` because it sets one password on every account.

## Start it

```bash
docker compose -f docker-compose.local.yml up -d                       # the local Mongo, port 27018
pnpm --filter @greynote/api dev:local                                  # the API on http://localhost:3100 (uses apps/api/.env.local)

# the test world (once; a second run only re-sets passwords; `-- --remove --apply` takes it out)
DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:local-test -- --apply
```

| What | Value |
|---|---|
| Database (`apps/api/.env.local`) | `MONGO_URI=mongodb://127.0.0.1:27018/greynotenew` |
| Phone app in a browser | `EXPO_PUBLIC_API_URL=http://localhost:3100/api` then `npx expo start --web` in `apps/fieldApp` |
| Phone app on a phone (same Wi-Fi) | `EXPO_PUBLIC_API_URL=http://<this PC's Wi-Fi IP>:3100/api` then `npx expo start --lan` |
| Admin web | `NEXT_PUBLIC_API_BASE_URL=http://localhost:3100/api` in `apps/web/.env` (it is read at build, so restart `next dev`); the web runs on :3001, already in `CORS_ORIGINS` |

Stop any `pnpm dev` on port 3000 first: it talks to Atlas.

## Password: `admin123` for every account (local copy only)

The demo accounts skip the "new device" approval on the phone. **Real staff (`GHC…`) do not**: a new device waits for an Admin to approve it (and two devices is the limit), so use the demo accounts for testing and `ADMIN01` to approve a real one in the web portal if you need it.

| Role | Code |
|---|---|
| Admin (web) | `ADMIN01` |
| HR (web) | `GHC002` |
| ZSM | `DEMOZSM` |
| RSM | `DEMORSM` |
| ASM | `DEMOASM` (North), `DEMOASM2` (South) |
| MR | `DEMOMRA1`, `DEMOMRA2`, `DEMOMRA3` (under `DEMOASM`), `DEMOMRB1`, `DEMOMRB2` (under `DEMOASM2`), `DEMOMRR1`, `DEMOMRR2` (direct to `DEMORSM`) |
| Also there | `DEMOMGR` (ASM) with `DEMOMR1`–`DEMOMR3` (an older demo team, its own zone) |

## The team and what each MR holds

```
DEMOZSM ── DEMORSM ─┬─ DEMOASM  ─┬─ DEMOMRA1  routes N1, OUT
                    │            ├─ DEMOMRA2  routes N1, N2        (N1 is held by two MRs)
                    │            └─ DEMOMRA3  route N3
                    ├─ DEMOASM2 ─┬─ DEMOMRB1  route S1
                    │            └─ DEMOMRB2  route S2             (S3 is held by nobody)
                    ├─ DEMOMRR1  route W1                          (direct to the RSM)
                    └─ DEMOMRR2  routes W1, W2                     (W1 is held by two MRs)
```

- **Managers hold no route.** What they see and plan is computed from the MRs below them.
- Zone `TEST East`; HQs `TEST HQ North` (N1, N2, N3, OUT = out-station to Kolkata), `TEST HQ South` (S1, S2, S3), `TEST HQ West` (W1, W2).
- **Doctors:** 4 on every held route (`TEST Dr. N1-1` …), one `TEST Dr. Unassigned` (on N1), one `TEST Dr. Route-not-held` (on S3, assigned to `DEMOMRB2`, who does not hold S3).
- **Chemists:** 3 on every held route (`TEST Chemist N1-1` …), each held by **every MR on that route**; `TEST Chemist Unassigned` on N3.
- **Distributors:** `TEST Distributor North` (A1, A2, A3), `South` (B1, B2), `All` (A1, B1, R1).
- **Plans:** an **approved November Tour Plan** for everyone above, 17–30 Nov (Sundays off), one route a day (a manager's are the routes of their MRs), **no Works with**. The **Daily Plans** for those days exist as drafts, so today can be opened and changed. December plans are not seeded.

## Try this

| Who | Do this | Expect |
|---|---|---|
| `DEMOASM` | Daily Plan, today | The route (N1 on 17 Nov) is chosen from the approved routes. **Works with** lists only `MR A1` and `MR A2` with the route in brackets, **Doctors** only the 4 on N1. |
| `DEMOASM` | Pick `DEMOMRA3` or a doctor on N3 while the route is N1 | Refused: "Pick people who hold this day's routes…" / "not on the routes planned for the day". |
| `DEMOASM` | Choose a route that is not in the approved day | Refused: "Pick routes from this day's approved plan. Ask your manager or Admin to change the plan." |
| `DEMORSM` | Daily Plan on a route of South and West | Works with shows the ASM above the MRs and the MRs, never someone from another route. |
| `DEMOZSM` | Same, with routes N1 and S1 | The RSM, both ASMs and the holding MRs, routes in brackets. |
| `DEMOASM` | Tour Plan route picker (a month) | HQ first, then search: only North's four routes. S and W routes are not offered. |
| `DEMOASM2` | Team doctors | `TEST Dr. Route-not-held` is listed with the **route not held** flag. |
| `DEMOASM` | Team chemists | Chemists on N1 list **two** MRs. `TEST Chemist Unassigned` is not shown (nobody in the team holds it). |
| `DEMORSM` | Team → Territory | North 5, South 3, West 2 people; all three HQs owned. |
| `DEMOMRA1` | Chemists / orders | "assigned to you"; calls on the shared N1 chemists work. |
| `ADMIN01` (web) | A chemist's page → Assigned MRs | Add or remove MRs; history kept. |
| `ADMIN01` (web) | Amend a manager's Tour Plan day | No Works with field; the route list is the team's routes. |

The same checks were run against the real API when this was set up: team routes, route options, the refusals above, team doctors/chemists/distributors and Team → Territory all answer as listed.

## Secondary sales sheet (Excel)

```bash
DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:secondary-demo -- --apply   # local only; run again any time
```

Writes, for the seven demo MRs (A1-A3, B1-B2, R1-R2): product **targets** (units, eight products, a different figure for each half of the year), **approved** secondary for April to last month, a **draft** this month for `DEMOMRA1` and `DEMOMRB1` (must not count), and last financial year approved for those two (so **% GR.** shows). The rows go straight into the local database as approved because the real submit path needs a proof upload and Cloudinary is not set up here.

Try: `ADMIN01` on the web, Reports → Sales dashboard → open `Demo MR A1` → *Download Excel*; `DEMORSM` or `DEMOASM` on the phone, a person's page → Download → *Secondary sales (Excel)* (their team only); `DEMOMRA1` can download only their own sheet (403 for anyone else). Change the financial year (the selector) and download again: the title and figures follow it. Expect each MR to show about ₹50.5 lakh of target and ₹21-23 lakh of secondary so far, and `DEMOASM`'s sheet (the sum of A1-A3) to be the total of the three.

## Monthly work report

```bash
DOTENV_CONFIG_PATH=.env.local pnpm --filter @greynote/api seed:work-demo -- --apply   # local only; run again any time
```

Writes this month's daily work (every Monday to Saturday up to yesterday) for `DEMOMRA3`, `DEMOMRB1` and `DEMOMRB2`: an approved Daily Plan of three doctors a day, an approved report with calls on two of them (one day in seven has no report: all three missed), chemist calls, follow-ups, TA and DA expenses, one own claim, one **paid-leave** day and one **unpaid-leave** day (a holiday is not seeded: it would change every person's calendar). The last doctor of each MR is **never called**, so he is carried to the month end and "not called at all". Every doctor of these MRs gets a visit target of 2. Written straight into the local database as already approved (it skips the phone's sync, location check and approval flows).

Try: `DEMORSM` on the phone, Team → Demo ASM 2 → Demo MR B1: Overview shows the *Doctors this month* card (about 4 doctors with a target, 6 of 8 visits made, 2 missed, 1 not called at all, 1 carried over); the Doctors tab filters; Download → *Monthly work report (Excel)*: a row for every day (weekly off, paid and unpaid leave, worked, absent), the DCR yes/no, doctor calls, missed and carried, TA / DA / other. Its Overview sheet gives the same doctor numbers as the card. The Tour Plan column is empty before 17 Nov (the Tour Plan seed starts then).
