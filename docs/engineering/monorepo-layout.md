# Monorepo Layout

pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) plus Turborepo for task
orchestration (`turbo.json`).

## Today

```
apps/
  api/                  Express modular-monolith API
packages/
  config/               Shared tsconfig + eslint base configs — no runtime code
  contracts/            Wire types shared across the API and its future clients
```

## Planned, per docs/roadmap.md

```
apps/
  web/                  Next.js — Admin/HR/Accountant portal (phase 9)
  mobile/               React Native (Expo) + SQLite — field-force app (phase 10)
packages/
  shared/                @greynote/shared — code genuinely needed by BOTH apps/api and
                          apps/mobile (validation schemas, the offline-sync payload shape),
                          not code that merely could be shared
```

`apps/web` talks to `apps/api` over HTTP like any browser client — it does not import
`@greynote/contracts`'s server-only pieces any differently from how a Next.js app consumes any
REST API. `apps/mobile` is where `packages/shared` actually earns its keep: the offline queue's
local payload shape and its server-side validation must be the same type, checked at compile
time, or a schema drift between the app and the API surfaces as silently-dropped submissions in
the field rather than a type error in CI.

## `apps/api`

```
apps/api/src/
  config/               env.ts — every env var, parsed once via Zod at boot
  container.ts          Top-level composition root — builds every module's container
  routes.ts             Mounts every module's router under /api
  app.ts                Express app: middleware order, mounting
  server.ts             Process entrypoint: listen, graceful shutdown
  shared/               Below every module (see boundaries-and-enforcement.md) — errors,
                          logging, HTTP plumbing (request-id, response envelope, error handler)
  modules/
    health/              The reference implementation — copy this for a new module
    <module>/            One directory per ERD module, added as docs/roadmap.md reaches it
```

Where new code goes:

- **A new ERD module** (Identity, Territory, …) → `apps/api/src/modules/<name>/`, following
  `module-anatomy.md` and `adding-a-module.md`.
- **A cross-cutting mechanism used by more than one module** (the Approval Workflow Engine,
  offline-sync payload validation) → `apps/api/src/shared/` for now; graduates to
  `packages/shared` the moment `apps/mobile` needs the identical logic client-side too — see
  `docs/roadmap.md` phase 3's note on this.
- **A wire type used across modules or across apps** → `packages/contracts`.
- **Tooling config** (tsconfig, eslint) shared across packages → `packages/config`.

## Why `packages/config` and `packages/contracts` exist before there's a second app

`packages/config` avoids every workspace package hand-rolling its own `tsconfig.json`/
`eslint.config.js` from scratch — `apps/api/tsconfig.json` already `extends
"@greynote/config/tsconfig.base.json"`. `packages/contracts` is where `AppError`'s `FaultCode`
union and the HTTP envelope types (`HttpSuccessBody`, `HttpErrorBody`, `RequestMeta`) live today
— genuinely shared within `apps/api` between `shared/http/` and every module, and ready to be
imported by `apps/web` the moment it exists, without a rename.
