# Build & Deploy

## What gets produced

| Artifact | Built from | Contains | Goes to |
|---|---|---|---|
| `greynote-api` | `apps/api/Dockerfile` | `dist/` + prod deps | VM / ECS |
| `greynote-web` | `apps/web/Dockerfile` | Next standalone output | VM / ECS |

Two server artifacts, driverzone's shape: a separate image and container for the web, same VM to start.

## The build context is the repo root; the image is not

Both today's and tomorrow's Dockerfile build from `.` — the pnpm lockfile and workspace manifest
live at the repo root, and `--frozen-lockfile` is impossible without them. But the runtime stage
copies only its own app's build output:

```dockerfile
# apps/api/Dockerfile — runtime stage
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist     ./dist
```

No `apps/web` code, once it exists, ends up in the API image or vice versa. `.dockerignore` keeps
`node_modules`, build output and `docs/` out of the build context entirely, so they're never
uploaded to the daemon.

## Dockerfile structure

Three stages, split for layer caching:

```
base     node:22-alpine + pinned corepack pnpm
  ↓
deps     COPY manifests only  →  pnpm install --frozen-lockfile
  ↓                              ← editing a .ts file does NOT invalidate this
build    COPY source          →  tsc --noEmit && esbuild  →  pnpm deploy --prod
  ↓
runtime  COPY dist + node_modules, USER node, CMD
```

Details that took a while to get right elsewhere and apply here unchanged:

- **`corepack prepare pnpm@11.18.0`**, pinned to the root `packageManager`. Unpinned, the deploy
  host could resolve a different pnpm than the lockfile was written by.
- **`--frozen-lockfile`** so a stale lockfile fails the build loudly rather than quietly
  resolving untested versions.
- **`COPY packages/…`** in the build stage. `packages/contracts` is source-only
  (`exports: "./src/index.ts"`); omitting it fails the build on the first `@greynote/contracts`
  import.
- **Third-party deps stay external; `@greynote/*` packages are bundled** — see the comment at
  the top of `apps/api/esbuild.config.mjs`. Getting this backwards doesn't fail the build; it
  fails the **container**, on its first line, with
  `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` — a Docker build succeeding is not the same as
  the image working. Run it before believing it:
  ```bash
  docker run --rm -e MONGO_URI=... greynote-api
  ```
- **`USER node`.** Never root.
- **Exec-form `CMD`**, so node is PID 1 and receives `SIGTERM` directly — `server.ts`'s own
  shutdown handler drains in-flight requests within its timeout; a shell wrapper would swallow
  the signal and every deploy would cut live responses mid-flight.
- **`tsc --noEmit` inside `build`**, so a type error fails the image rather than shipping.

## No database container, in either compose file

`docker-compose.prod.yml` has no `mongo` service, and there is no `docker-compose.dev.yml` at
all today — MongoDB is Atlas-hosted in every environment
([`../decision-log.md`](../decision-log.md), 2026-09-23). This is the one place this document
structurally diverges from the driverzone pattern it otherwise follows: there's no replica-set
bootstrap step, no database volume to name per environment, and no `docker exec … mongosh` to
inspect it — that's done against Atlas directly. What **does** carry over: a real deploy needs
the host's egress IP allowlisted on the target Atlas project first (`../manual_deploy.md`), which
is this stack's equivalent of "the database has to be reachable before the app can start."

## Local development

```bash
cp apps/api/.env.example apps/api/.env
# set MONGO_URI to a dev Atlas connection string
pnpm dev
```

No compose file, no infra container to start first. Full guide:
[`../setup-development.md`](../setup-development.md).

## CI

Not yet configured (no `.github/workflows/` in this repo). When it is, path-filtering with turbo
is the same discipline driverzone uses and should be adopted unchanged — it's what keeps a
change to one module from rebuilding and redeploying everything:

```bash
pnpm turbo run typecheck lint build --filter='...[origin/main]'
```

Suggested pipeline, to set up once there's more than one app to filter between:

```
on PR:
  install (pnpm cache) → pnpm check

on merge to main:
  detect changed paths
  ├─ apps/api or packages/{contracts,config}      → build+push api image → deploy api
  └─ apps/web or packages/{contracts,config}       → build+push web image → deploy web   
```

## Production topology

At current scale, one VM:

```
              nginx (TLS, rate limits)
                     │
                  api:3000
                     │
              MongoDB Atlas (managed, off-VM)
```

The API listens on `3000` and the web on `3001` (decided 2026-10-01), so both can run on one VM.
The portal and the API must share a registrable domain (e.g. `app.` and `api.` under one
domain): the refresh cookie is `SameSite=Strict`, so a different site would never send it.

### Scaling order

Nothing here needs rearchitecting for a while — this is a request/response CRUD-plus-approvals
system, not a real-time dispatch platform. The parts most likely to strain first, in rough order:

1. **Mongo read/write volume on hot collections** (DCR, Field Activity during business hours) —
   Atlas handles this with read replicas / tiering before any application change is needed.
2. **The API process itself**, once traffic outgrows one instance — horizontal scaling behind
   nginx is a compose/orchestration change, not a code change, because nothing in `apps/api`
   holds in-process state that would break under multiple instances (no in-memory queue, no
   sticky sessions).

## Environment variables

| Where | How | Why |
|---|---|---|
| API (runtime) | compose `env_file` | Secrets must never enter an image layer — a baked `.env` leaks to anyone who can pull the image |
| Web (`NEXT_PUBLIC_*`) | Docker build args (`NEXT_PUBLIC_API_BASE_URL`, read from the root `.env` by compose) | Next inlines these into the client bundle at build time — the same reasoning driverzone documents: pointing at a different API is a rebuild, not a restart |

`apps/api/src/config/env.ts` parses everything through Zod at boot. A missing variable fails the
process immediately with the variable named, rather than surfacing as `undefined` inside a
connection string later.

## Release checklist

- [ ] `pnpm check` green
- [ ] `pnpm --filter @greynote/api lint:deps` — no boundary violations
- [ ] Image builds from a clean clone
- [ ] The deploy target's Atlas project has the host's egress IP allowlisted
- [ ] `docker run` the built image locally before pushing it — a build succeeding is not the
      same as the image working
- [ ] `/api/health` returns `200` after deploy (`503` = a dependency, currently only Mongo, is
      down)
