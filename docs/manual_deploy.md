# Manual Deploy — Staging VM

Before automating this with CI/CD, deploy the staging VM by hand once, to prove the box is
correctly provisioned. Written for `apps/api` today — the only app that exists
([`roadmap.md`](roadmap.md)); it grows a `web` section once `apps/web` is scaffolded (phase 9).

Assumes a Debian-based VM (Ubuntu 22.04/24.04), the common default across AWS EC2,
DigitalOcean, Hetzner, etc.

---

## Step 1 — Connect to the VM

```bash
ssh username@your_staging_vm_ip
```

## Step 2 — Install Docker & Docker Compose

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect.
```

## Step 3 — Generate SSH keys & connect to GitHub

```bash
ssh-keygen -t ed25519 -C "staging-vm-deploy-key"
cat ~/.ssh/id_ed25519.pub
```

Copy the output, add it as a **Deploy Key** on the GitHub repo (Settings → Deploy Keys), then
verify:

```bash
ssh -T git@github.com
```

## Step 4 — Clone the repository

```bash
mkdir -p ~/deployments && cd ~/deployments
git clone <repo-url> greynote
cd greynote
git checkout staging
```

## Step 5 — MongoDB Atlas: allowlist this VM

Unlike a self-hosted database, there is nothing to install here — MongoDB is Atlas-hosted in
every environment, including staging ([`decision-log.md`](decision-log.md), 2026-09-23). But
Atlas defaults to rejecting connections from unknown IPs, so this step is not optional:

1. Find the VM's public egress IP: `curl -4 ifconfig.me`
2. In the Atlas project's **Network Access** page, add that IP (or a `/32` CIDR for it) to the
   allowlist.
3. Confirm the staging cluster's connection string — a **separate** Atlas cluster or database
   from both your personal dev cluster and production, so staging data never contaminates either.

Skipping this step is the single most common reason the container below starts cleanly and every
request 500s: the build succeeds, the process boots, and the first Mongo query times out.

## Step 6 — Configure environment variables

```bash
cp apps/api/.env.prod.example apps/api/.env.prod
# nano apps/api/.env.prod
#   - MONGO_URI: the staging Atlas connection string from Step 5
#   - CORS_ORIGINS: this VM's own origin, the portal's own origin, e.g. http://your_staging_vm_ip:3001 —
#     the example ships http://localhost:3001, which is the local dev origin only.
#     In production add https://www.greynotehealth.com too (comma-separated): the public account-deletion form lives there
```

## Step 7 — Build and run the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first `--build` compiles the image and takes a few minutes.

## Step 8 — Seed the database (first deploy only)

Server boot does no database writes — `SystemConfig`/`Role` defaults and the first Admin are
seeded by an explicit script instead (`docs/decision-log.md`), run once inside the now-running
container:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/seed.js
```

It seeds Config/Role defaults (safe to re-run anytime — never overwrites an edited value), then,
only if no `ADMIN` user exists yet, prompts interactively for the first Admin's details (password
entry masked, typed twice). `docker compose exec` allocates a terminal for this automatically when
run from an interactive shell, so the prompts appear normally.

### Step 8a — A brand-new production database (go-live)

For the real production database, which starts empty and is **not** the dev database (decision-log 2026-10-13), use the
non-interactive seed instead of `seed.js`:

1. In Atlas create a database with its own name (e.g. `greynote-prod`) and put it in `MONGO_URI` in `.env.prod`. Use new
   JWT secrets and the production Cloudinary account there too.
2. Check `apps/api/prod-seed/payBands.json` (pay bands / grades with TA and DA in paise). It was exported from dev with
   `pnpm --filter @greynote/api export:pay-bands`; edit the numbers to the real ones before building the image.
3. Rehearse on a scratch database name first, then drop it. Then, for real:

```bash
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_CODE=… -e ADMIN_NAME=… -e ADMIN_EMAIL=… -e ADMIN_PHONE=… -e DEMO_MANAGER_PASSWORD=… \
  api node dist/scripts/seed-production.js --confirm-db=greynote-prod
```

It refuses unless the database named in `MONGO_URI` is repeated in `--confirm-db` and has no users. It seeds the config
defaults, roles, pay components, leave types, the five designations, the pay bands, the Admin and the Play reviewer's
demo accounts (DEMOMGR, DEMOMR1-3, same password as in Play Console). The Admin's password is random, printed once to the
terminal and not stored — copy it into a password manager and change it after the first sign-in. Everything else
(zones, HQs, routes, doctors, employees) is entered in the portal.

## Step 9 — Convert money to paise (once, when upgrading past 2026-09-29)

Money became whole paise under new field names (`docs/decision-log.md`, 2026-09-29). A database that
still holds the old `Decimal128` rupee fields must be converted **before the new version starts**, or
Pay Bands and Route rate overrides read as empty. Dry run first (changes nothing, lists what it would
do), then apply (saves a backup file first):

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-money-to-paise.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-money-to-paise.js --apply --backup /tmp/money-backup.json
```

It is safe to run again: a converted document is skipped, and a value it can't convert exactly (more
than 2 decimal places, or negative) stops the whole run before anything is written. A fresh database
that never had the old fields has nothing to convert.

## Step 9b — Flatten the territory (once, when upgrading past 2026-10-03)

`Area` was removed: a Route now belongs to an HQ, has one destination and carries the DA type
(`docs/decision-log.md`, 2026-10-03). A database with Routes and Areas in the old shape must be
converted **before the new version starts**, or its Routes can't be read. Dry run first (changes
nothing, lists what it would do), then apply (saves a backup file first):

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-territory-flatten.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-territory-flatten.js --apply --backup /tmp/territory-backup.json
```

Each Route takes its HQ and type from its Area and keeps its **last waypoint** as the destination;
the `areas` collection is dropped once the result is verified. The run stops before writing anything if
a Route has no Area or no waypoints, or if two Routes would now share a name under one HQ (rename one
and run again). It is safe to run again.

**Then set each HQ's base place in the portal.** The script can't know it: it only prints a suggestion
(where the HQ's first Route used to start). Saving the base place recalculates that HQ's Routes from it,
except any with a manually entered distance, which are listed so you can check them. Until then the
stored distances stay as they were, and the HQ can't get a new Route. A fresh database has nothing to
convert.

## Step 9c — Give approved Monthly Plans their days (once, when upgrading past the 2026-10-03 plan change)

Daily Plans are now written from the approved Monthly Plan (`docs/decision-log.md`, 2026-10-03). Monthly Plans approved
**before** that have no days yet; this writes the coming ones, exactly as approving them today would. Days already planned
are left alone, so it is safe to run again. Dry run first:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-inherit-monthly-plans.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-inherit-monthly-plans.js --apply
```

Employees still submit each day. A fresh database has nothing to convert. Also: `MONTHLY_STOCK_GRACE_DAYS` is gone, replaced
by `MONTHLY_STOCK_DEADLINE_DAY`. **Re-run the seed (Step 8; safe to repeat) so the three new settings (`DCR_APPROVAL_REQUIRED`, `APPROVAL_SLA_DAYS`, `MONTHLY_STOCK_DEADLINE_DAY`) appear in System settings** — it only adds missing keys. Schedule the stock check for the day after the deadline day.

## Step 9c-1 — Expense deadlines (once, when upgrading past 2026-10-12)

Monthly expenses now have a send and an approval deadline and a late exception (decision-log 2026-10-12). **Re-run the seed (Step 8; safe to repeat)** so `EXPENSE_SUBMIT_CUTOFF_DAY`, `EXPENSE_APPROVAL_CUTOFF_DAY`, `LATE_EXPENSE_GRANT_BY_MANAGER`, `LATE_EXPENSE_GRANT_VALID_HOURS` and `LATE_EXPENSE_GRANT_MAX_HOURS` appear in System settings (until then the API uses 7, 10, off, 24 and 168). A month already sent that is approved after its approval day needs an exception first.

## Step 9c-2 — Drop the old plan-change requests, and set the missed-report grace (once, when upgrading past 2026-10-12)

The employee's "request a change" to an approved Daily Plan is gone (`docs/decision-log.md`, 2026-10-12). Delete what it left behind — dry run first:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-drop-daily-plan-changes.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-drop-daily-plan-changes.js --apply
```

The server now runs the missed-report check itself every 15 minutes; the `compliance:run` cron is no longer needed (the script stays for a dry run). To block on the **first** missed day, set **Missed-report grace** (`DCR_MISS_GRACE_DAYS`) to `0` in Admin → Settings — the seed never overwrites a live value.

## Step 9d — Build the speciality list, and re-run the seed (once, when upgrading past 2026-10-06)

A doctor's speciality is now chosen from an Admin-kept list, and the doctor's *category* is gone (`docs/decision-log.md`, 2026-10-06). **Re-run the seed
(Step 8) first** so the new settings (`TA_MAX_KM`, `EX_STATION_MIN_KM`, `OUT_STATION_MIN_KM`, `PROBATION_MONTHS`, `PROBATION_LEAVE_PAID`, `SALARY_RUN_DAY`,
`EXPENSE_PAYOUT_DAY`, `FY_CLOSED_YEARS`, `LEAVE_LOCKED_AFTER_PAYROLL`) exist; without them the API fails when it first reads one. Then build the list from a
starter set plus every speciality the existing doctors carry (spellings that differ only in case or spacing are merged, and those doctors respelled). Dry run first:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-specialties.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-specialties.js --apply
```

These scripts are bundled into the image (`apps/api/esbuild.config.mjs`); if `Cannot find module` appears, the image is older: `git pull` then `docker compose -f docker-compose.prod.yml up -d --build`.

Safe to run again. A fresh database gets the starter list and nothing else to convert. Old doctor `category` values stay in the database and are never read.

## Step 9e — Drop the CTC range from pay grades (once, when upgrading past 2026-10-06)

A pay grade no longer holds a CTC range; the CTC is per employee (`docs/decision-log.md`, 2026-10-06). **Re-run the seed (Step 8) first** so the new setting
`CTC_JUMP_WARN_PERCENT` exists. Then remove the old fields from the grades (and set the case-insensitive name key if an older database lacks it). Dry run first;
`--apply` writes a backup file before changing anything:

```bash
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-paybands.js
docker compose -f docker-compose.prod.yml exec api node dist/scripts/migrate-paybands.js --apply
```

Safe to run again. Employees' saved CTC revisions are not touched.

## Step 9f — Re-run the seed for the absent-day settings (once, when upgrading past 2026-10-07)

Salary now deducts absent days (`docs/decision-log.md`, 2026-10-06 and 2026-10-07). **Re-run the seed (Step 8)** so `ABSENT_DEDUCTS_SALARY` (default on) and
`STRIKE_DEDUCTS_SALARY` (default off) exist; without them the Attendance screen and payroll generation fail when they first read one. Decide before the first payroll
run after the upgrade whether absent days should cost salary yet: switch `ABSENT_DEDUCTS_SALARY` off in System settings to see the Attendance screen first, and
on again when HR is ready. Generate the first sheet as a **draft** and read the Attendance screen's absent days before finalizing.

## Step 10 — Schedule the daily compliance job

The application has no scheduler. Once a day, after the business day rolls over (the **Business day starts at** setting, `DAY_START_TIME`: with `02:00`, schedule it at 02:30 or later, never at 00:05), the
operator's cron runs the missed-DCR job, which blocks each field employee who has missed more working days in a
row than `DCR_MISS_GRACE_DAYS` allows (`docs/hld/10-submission-gating-and-compliance-block.md` §2):

```bash
docker compose -f docker-compose.prod.yml exec -T api node dist/scripts/run-compliance.js --dry-run   # report only
docker compose -f docker-compose.prod.yml exec -T api node dist/scripts/run-compliance.js             # block
```

`--user <id>` (repeatable) limits a run to those employees. It is safe to run twice, or again after a failure,
and does nothing while `DCR_MISS_BLOCK_ENABLED` is `false` in System Config. It exits `1` if any employee could
not be checked, so the cron wrapper can alert. Try the dry run first and read who it would block before the first
real run.

## Verification

```bash
docker ps                                              # `api` should be Up (healthy)
docker compose -f docker-compose.prod.yml logs -f api  # if anything looks wrong

curl -I http://localhost:3000/api/health               # 200 = healthy from inside the VM
curl -I http://your_staging_vm_ip:3000/api/health       # 200 = reachable from outside it too
```

A `503` here almost always means Step 5 was skipped or the connection string in `.env.prod` still
has the `<user>`/`<password>`/`<cluster>` placeholders from the example file.

---

## Updating a running deploy

```bash
cd ~/deployments/greynote
git pull origin staging
docker compose -f docker-compose.prod.yml up -d --build
```

`up -d --build` only rebuilds and restarts what changed; a deploy with no code changes since the
last one is a no-op.
