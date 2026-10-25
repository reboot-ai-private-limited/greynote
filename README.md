# Greynote
product price update
A lightweight Sales Force Automation (SFA) platform for pharmaceutical field operations —
daily call reporting (DCR), territory routing, TA/DA expenses, and hierarchical approvals, split
into an offline-first mobile app for the field force and a web portal for Admin/HR/Accounting.

One repo, growing toward three apps:

| | | Runs on | Status |
|---|---|---|---|
| `apps/api` | Express modular-monolith API | server | in progress — Config, Identity, Territory and Approval done ([`docs/roadmap.md`](docs/roadmap.md) phases 0–3); phase 4 next |
| `apps/web` | Next.js admin/HR/accountant portal | server | planned — [`docs/roadmap.md`](docs/roadmap.md) phase 9 |
| `apps/mobile` | React Native field-force app | App Store / Play | planned — [`docs/roadmap.md`](docs/roadmap.md) phase 10 |

Plus `packages/config` and `packages/contracts` today; `packages/shared` once the mobile app
starts (see [`docs/engineering/monorepo-layout.md`](docs/engineering/monorepo-layout.md)).

---

## Prerequisites

| | Version | Check |
|---|---|---|
| Node | ≥ 20 | `node --version` |
| pnpm | 11.18.0 | `corepack enable && corepack prepare pnpm@11.18.0 --activate` |
| Docker | any recent, with Compose v2 | `docker compose version` — only needed for the production-style build, see below |

Use **corepack**, not a globally installed pnpm — the version is pinned in `package.json` and a
different one resolves the lockfile differently.

There is no local database to install. MongoDB is **Atlas-hosted in every environment**,
including local development — you need a connection string, not a running Mongo. See
[`docs/setup-development.md`](docs/setup-development.md) for where to get one.

## First-time setup

The condensed version is below. [`docs/setup-development.md`](docs/setup-development.md) is the
full guide, including the production-style Docker build and troubleshooting.

```bash
git clone <repo-url> greynote
cd greynote

corepack enable && corepack prepare pnpm@11.18.0 --activate
pnpm install

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — at minimum MONGO_URI, an Atlas connection string for your dev cluster

pnpm check      # typecheck + lint, everything
pnpm dev        # apps/api, watch mode, :3000
```

Confirm it worked, in a second terminal:

```bash
curl localhost:3000/api/health
```

`200` means healthy. `503` means the API is up but a dependency is down — the `dependencies`
array in the response names which one.

---

## Daily workflow

```bash
git checkout main
git pull origin main
pnpm install                    # in case someone changed a dependency

git checkout -b feat/identity-otp-login

# … work …

pnpm check                      # typecheck + lint, everything
git add -A
git commit -m "identity: enforce the 2-device login limit"
git push -u origin feat/identity-otp-login
```

Then open a PR against `main`.

### Branch names

```
feat/<short-description>     new functionality
fix/<short-description>      bug fix
docs/<short-description>     documentation only
chore/<short-description>    tooling, deps, config
refactor/<short-description> no behaviour change
```

### Commit messages

Prefix with the module or app you touched — it makes `git log --oneline` navigable in a
monorepo:

```
identity: block a 5th concurrent field-force session instead of evicting the oldest

PRD §2 requires an explicit "log out elsewhere first" prompt, not silent eviction —
a silently killed session mid-DCR-submission would look like the app crashed.

Refs: docs/hld/04-authentication-and-sessions.md
```

Not `fix stuff`.

### Before you push

```bash
pnpm check
```

Runs `typecheck` and `lint` across every package via Turborepo. `lint` includes
`dependency-cruiser` for `apps/api` — **a module-boundary violation fails the build, and it is
protecting the same tier order `docs/roadmap.md` builds against, not just tidiness.** See
[`docs/engineering/boundaries-and-enforcement.md`](docs/engineering/boundaries-and-enforcement.md).

---

## Working on each app

### API — `apps/api`

```bash
pnpm --filter @greynote/api dev          # :3000, watch mode (tsx watch)

pnpm --filter @greynote/api typecheck
pnpm --filter @greynote/api lint         # eslint + dependency-cruiser
pnpm --filter @greynote/api lint:deps    # boundaries only, faster
pnpm --filter @greynote/api build        # tsc --noEmit && esbuild → dist/
```

**Adding a module?** Follow
[`docs/engineering/adding-a-module.md`](docs/engineering/adding-a-module.md) and copy
`src/modules/health/` — it's the reference implementation, nine files, five minutes to read.

### Admin portal — `apps/web` (not yet scaffolded)

Planned as Next.js, same shape as `apps/api`'s dev workflow (`pnpm --filter @greynote/web dev`,
API expected on `:3000`). This section fills in when [`docs/roadmap.md`](docs/roadmap.md) phase 9
starts.

### Mobile — `apps/mobile` (not yet scaffolded)

Planned as React Native (Expo) + SQLite for the offline store. This section fills in when
[`docs/roadmap.md`](docs/roadmap.md) phase 10 starts — including the "own terminal, not through
turbo" caveat every Expo app in a monorepo needs (driverzone's
[`docs/setup-development.md`](../driverzone/docs/setup-development.md) documents why, and it will
apply here unchanged).

---

## Command reference

Run from the repo root — turbo fans out across all packages:

| Command | Does |
|---|---|
| `pnpm dev` | `apps/api` today; fans out to every app once more exist |
| `pnpm typecheck` | `tsc --noEmit` everywhere |
| `pnpm lint` | ESLint + dependency-cruiser |
| `pnpm check` | typecheck + lint — **run before pushing** |
| `pnpm build` | `tsc --noEmit && esbuild` for `apps/api` |
| `pnpm format` | Prettier, write |
| `pnpm format:check` | Prettier, verify only |

Target one package with `--filter`:

```bash
pnpm --filter @greynote/api typecheck
pnpm --filter '@greynote/api...' build     # api AND everything it depends on
```

---

## Docker

There is no local database container — MongoDB is Atlas in every environment, so
`docker-compose.dev.yml` has nothing to run today; just `pnpm dev` against your `.env`. See
[`docs/setup-development.md`](docs/setup-development.md).

The production-style build — the API as a built image, the way a deployed host runs it:

```bash
cp apps/api/.env.prod.example apps/api/.env.prod    # once, then edit it
docker compose -f docker-compose.prod.yml up -d --build
```

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
curl localhost:3000/api/health
docker compose -f docker-compose.prod.yml down
```

Building the image by hand — note the build **context is the repo root**, not `apps/api`:

```bash
docker build -f apps/api/Dockerfile -t greynote-api .
docker run --rm -e MONGO_URI=... -e CORS_ORIGINS=http://localhost:3000 greynote-api
```

**A Docker build succeeding is not the same as the image working.** Run it before believing it —
see [`docs/engineering/build-and-deploy.md`](docs/engineering/build-and-deploy.md).

---

## Two things to know before your first PR

**Modules talk through `.public.ts` and nothing else.** `src/modules/planning/` cannot import
`src/modules/identity/domain/user.entity.js` — it imports `identity.public.js`. Machine-enforced
by `dependency-cruiser`, and it costs nothing at runtime: the contract file is types only.

**Modules import strictly downward, by tier.** `apps/api/.dependency-cruiser.cjs`'s
`MODULE_TIERS` is the actual dependency graph — Config → Identity → {Territory, Approval} →
{Field Master Data, Planning, HR} → {Field Activity, Sales, Marketing} → Payroll — and it is the same order
[`docs/roadmap.md`](docs/roadmap.md) builds in. A same-tier or upward import means either the
dependency is backwards or the module belongs on a different tier.

---

## Documentation

| | |
|---|---|
| [`docs/prd.md`](docs/prd.md) | **The product** — what we're building, for whom, what's out of scope |
| [`docs/erd/`](docs/erd/README.md) | **The data** — the 9-module entity model |
| [`docs/hld/`](docs/hld/README.md) | **The mechanisms** — cross-cutting subsystems (sync, auth, approvals, payroll, …) |
| [`docs/LLD/`](docs/LLD/README.md) | **The design** — one module at a time: contracts, write-path rules, HTTP surface, edge cases |
| [`docs/roadmap.md`](docs/roadmap.md) | **The build order** — which module after which, and why |
| [`docs/engineering/`](docs/engineering/README.md) | **The code** — layout, module anatomy, boundaries, build & deploy |
| [`docs/setup-development.md`](docs/setup-development.md) | Clone to running stack |
| [`docs/manual_deploy.md`](docs/manual_deploy.md) | Staging VM, step by step |
| [`docs/decision-log.md`](docs/decision-log.md) | Decisions already made, dated, with what they replaced |

New to the project? Read [`docs/prd.md`](docs/prd.md), then
[`docs/engineering/README.md`](docs/engineering/README.md) `01`–`03` in order — about 45 minutes,
and it covers every decision you need to make sense of the rest.
