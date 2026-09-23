# Setting Up Greynote Locally

Unlike most Node/Mongo monorepos, there is **no local database to run**. MongoDB is
Atlas-hosted in every environment, including development ([`decision-log.md`](decision-log.md),
2026-09-23) — you need a connection string, not a `docker compose up`. That's the single biggest
difference from the sibling reference project `../driverzone`, and it means development setup
here is shorter: install, configure `.env`, `pnpm dev`. No compose file, no replica-set init step.

---

## Prerequisites

| | Version | Check |
|---|---|---|
| Node | ≥ 20 | `node --version` |
| pnpm | 11.18.0 | `corepack enable && corepack prepare pnpm@11.18.0 --activate` |
| Docker | any recent, with Compose v2 | `docker compose version` — only needed for the [production-style build](#production-style-build), not day-to-day work |

Use **corepack**, not a globally installed pnpm. The version is pinned in `package.json` and a
different one resolves the lockfile differently — which surfaces days later as a dependency that
works on your machine and nowhere else.

## An Atlas connection string

Ask a teammate for the shared dev cluster's connection string, or create your own free-tier
Atlas cluster for local work — either is fine; nothing about the dev workflow depends on which.
Either way it is an **SRV string**:

```
mongodb+srv://<user>:<password>@<cluster>.mongodb.net/greynote-dev?retryWrites=true&w=majority
```

Not a bare `mongodb://host:port` — Atlas clusters are DNS-seeded, and the driver resolves the
actual replica-set members from the `mongodb+srv://` record.

`MONGO_URI` is currently **optional** at boot (`apps/api/src/config/env.ts`) because no module
connects to Mongo yet — the `health` module's probe is in-memory. It becomes required the moment
the first Mongoose-backed module lands ([`roadmap.md`](roadmap.md) phase 1, Identity). Until
then the API runs fine with it unset; set it anyway once you're working on anything that will
eventually persist, so you're not surprised later.

---

## Development setup

From a fresh clone, top to bottom:

```bash
git clone <repo-url> greynote
cd greynote

corepack enable && corepack prepare pnpm@11.18.0 --activate
pnpm install

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — set MONGO_URI to your dev Atlas connection string

pnpm dev            # apps/api, watch mode, :3000
```

In a second terminal, confirm it worked:

```bash
curl localhost:3000/api/health
```

`200` means healthy. `503` means the API is up but a dependency is down — the `dependencies`
array in the response names which one (today, that's only Mongo, once `MONGO_URI` is set).

That's the whole setup. `pnpm dev` runs `tsx watch src/server.ts` — a saved file reloads in
under a second, no rebuild.

### Verify the whole workspace

```bash
pnpm check           # typecheck + lint, everything
```

`lint` includes `dependency-cruiser` for `apps/api`, which enforces the module-boundary and tier
rules. Under a modular monolith those boundaries are what keeps a module from reaching into
another's Mongoose model directly — see
[`engineering/boundaries-and-enforcement.md`](engineering/boundaries-and-enforcement.md).

### Running just the API

Today `pnpm dev` and `apps/api` are the same thing — there's nothing else to run yet:

```bash
pnpm --filter @greynote/api dev
pnpm --filter @greynote/api typecheck
pnpm --filter @greynote/api lint
pnpm --filter @greynote/api lint:deps    # boundaries only, faster than the full lint
pnpm --filter @greynote/api build        # tsc --noEmit && esbuild → dist/
```

This section grows a table like driverzone's `dev:api` / `dev:web` combinations once `apps/web`
and `apps/mobile` exist ([`roadmap.md`](roadmap.md) phases 9–10).

---

## Production-style build

Everything in Docker, built the way a deployed host builds it — useful to verify a release or
reproduce a bug that only appears in a built image, not for day-to-day development (every change
here is a rebuild, not a reload).

```bash
cp apps/api/.env.prod.example apps/api/.env.prod
# edit apps/api/.env.prod — MONGO_URI (a PRODUCTION or staging Atlas cluster, never the dev one),
# CORS_ORIGINS

docker compose -f docker-compose.prod.yml up -d --build
```

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api

curl localhost:3000/api/health
```

Tear it down when finished:

```bash
docker compose -f docker-compose.prod.yml down
```

### What differs from local development, and why

- **`apps/api/.env.prod`, not `.env`.** The dev file has `NODE_ENV=development` and a dev
  cluster's connection string; loading it into a production image would quietly misconfigure
  both.
- **Still no local database volume.** The `api` container's `MONGO_URI` points at Atlas the same
  as local dev does — just a different cluster. There is nothing to inspect with `docker exec`;
  inspect the database through Atlas itself (its own shell, Compass, or `mongosh` pointed at the
  same connection string).
- **`restart: unless-stopped`**, which the dev workflow has no equivalent for.

### A Docker build succeeding is not the same as the image working

```bash
docker build -f apps/api/Dockerfile -t greynote-api .
docker run --rm -e MONGO_URI=... -e CORS_ORIGINS=http://localhost:3000 greynote-api
```

Run the container before believing the build. See
[`engineering/build-and-deploy.md`](engineering/build-and-deploy.md) for the specific trap this
guards against (a workspace package bundled incorrectly builds clean and crashes on line one).

---

## Troubleshooting

**`Invalid environment: MONGO_URI is required`** (once Identity lands and it becomes required)
`apps/api/.env` doesn't exist or is missing the variable. `cp apps/api/.env.example
apps/api/.env`, then set it. Every variable is parsed through Zod at boot
(`apps/api/src/config/env.ts`), so a missing one fails immediately with its name.

**`MongooseServerSelectionError` / connection timeout**
Almost always one of: the Atlas connection string's password is wrong or URL-unescaped
incorrectly, your current IP isn't in that Atlas project's Network Access allowlist (Atlas
free-tier clusters default to allowing your dev machine's IP only), or you copy-pasted the
`<user>`/`<password>`/`<cluster>` placeholders from `.env.example` without replacing them.

**Port 3000 already in use**
Either another `pnpm dev` is already running, or the production-style stack is still up:
`docker compose -f docker-compose.prod.yml down`.

**`ERR_PNPM_IGNORED_BUILDS` on install**
pnpm blocks install scripts by default. The permitted ones are listed under `allowBuilds` in
`pnpm-workspace.yaml`. If a new dependency needs one, add it there deliberately — a postinstall
script is arbitrary code from a transitive dependency.

**`error module-internals-are-private`**
You imported another module's internals. Import its `<name>.public.ts` contract instead; if what
you need isn't on it, add it — that's the design working. See
[`engineering/boundaries-and-enforcement.md`](engineering/boundaries-and-enforcement.md#when-a-rule-blocks-you).

---

## Where to go next

- [`engineering/README.md`](engineering/README.md) — the handbook. Read `01`–`03` in order.
- [`roadmap.md`](roadmap.md) — what gets built in what order.
- [`manual_deploy.md`](manual_deploy.md) — taking this to a staging VM by hand.
- [`../README.md`](../README.md) — daily workflow and the full command reference.
