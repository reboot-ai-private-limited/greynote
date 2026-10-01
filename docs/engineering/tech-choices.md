# Tech Choices

Current state — what we use and why, in the present tense. History of what changed lives in
[`../decision-log.md`](../decision-log.md).

## Backend

| | Choice | Why |
|---|---|---|
| Runtime | Node.js 22, TypeScript, ESM (`"type": "module"`) | — |
| Framework | Express | Small, well-understood, no opinion imposed on the modular-monolith structure this repo builds on top of it |
| Database | MongoDB via **Mongoose** | `decision-log.md`, 2026-09-19 — switched from the prior approach; Mongoose schema validation is the primary validation at the persistence boundary |
| Database hosting | **MongoDB Atlas**, every environment including local dev | `decision-log.md`, 2026-09-23 — no local Mongo container anywhere in this repo |
| Validation (HTTP boundary) | Zod | Already used for `env.ts`; the natural choice for request-body validation in `interface/` too |
| API docs | `@asteasolutions/zod-to-openapi` + `swagger-ui-express` | Generates the OpenAPI doc from the same Zod schemas that validate requests — one definition, not two to keep in sync |
| Logging | pino | Fast, structured, built-in `redact` — see `coding-standards.md` |
| Dependency boundaries | `dependency-cruiser` | See `boundaries-and-enforcement.md` — ESLint's `no-restricted-imports` can't see a relative escape or a cycle |
| Monorepo tooling | pnpm workspaces + Turborepo | Pinned pnpm via corepack (`11.18.0`); turbo for task graph + caching |
| Build | `tsc --noEmit` (types only) + esbuild (bundle) | `esbuild.config.mjs` bundles `@greynote/*` workspace packages (source-only, no prebuilt output) and leaves third-party deps external (Mongoose does dynamic resolution a bundler can't follow) |

## Undecided

| | Status |
|---|---|
| Money storage | **Integer paise** (₹1 = 100), decided 2026-09-29 — no `Decimal128`, no floats. See `coding-standards.md#money`. |
| Mobile local-store layer | HLD-03 §1 names "React Native + SQLite (op-sqlite or similar, with Drizzle for local query building)" as a direction, not a final pick. Decide when `docs/roadmap.md` phase 10 starts. |
| Web portal state/data-fetching library | **TanStack Query v5** (decided 2026-10-01 with `apps/web`). Server state only: no global client store, filters live in the URL. Same choice as driverzone's admin panel. |
| Object/document storage (Doctor Service attachments, if any) | Not yet needed by any landed module. |

## Deliberately absent

- **A queue / worker process.** Nothing in the PRD or HLD currently needs asynchronous background
  processing the way driverzone's dispatch system needs BullMQ. `apps/api` ships one composition
  root (`server.ts`), not two. Add a queue when a specific use case needs one, not preemptively.
- **Redis.** Follows from the above — nothing here needs a cache or a queue backend yet.
- **A local database container.** MongoDB is Atlas-hosted everywhere; see the table above.
