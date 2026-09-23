# Decision Log

Decisions that have been **made**, newest first, with what they replaced and what they cost.

Three files cover decisions and they do not overlap:

| File | Answers |
|---|---|
| [`erd/`](erd/README.md) / [`hld/`](hld/README.md) | **The design as written** — schema and mechanism, in the present tense |
| [`engineering/tech-choices.md`](engineering/tech-choices.md) | **Current state**: what we use and why |
| this file | **History**: when it changed, what it replaced, what was rejected |

When something here supersedes an ERD/HLD doc or `tech-choices.md`, that doc gets rewritten to
describe the new present and this log keeps the record of the change. This log is append-only —
entries are never edited to match a later reversal; a reversal is a new entry that references the
old one.

---

## 2026-09-23 — MongoDB Atlas in every environment; no local Mongo container

**Decision:** `MONGO_URI` points at a MongoDB Atlas cluster in both development and production.
`docker-compose.dev.yml` and `docker-compose.prod.yml` define **no `mongo` service** in either
file.

**This reverses the pattern in the sibling reference project `../driverzone`**, which runs Mongo
as a local single-node replica set in `docker-compose.dev.yml` (with a one-shot `mongo-init`
container to promote it) for development, and a Docker-network-only Mongo service in
`docker-compose.prod.yml` for production.

**Why:** an Atlas cluster is already a replica set, so none of driverzone's `mongo-init`/
`directConnection=true` single-node bootstrap is needed here even if a module later needs
multi-document transactions. It also means one fewer moving part in local development — no
`docker compose up` before `pnpm dev`, no "did the replica-set init run" troubleshooting entry —
and production gets Atlas's managed backups and monitoring instead of a self-managed volume on
the deploy VM.

**Consequences:** `docs/setup-development.md` has no "start the dev stack" step; first-time setup
is `.env` pointing at a dev Atlas connection string, then `pnpm dev`. Clearing local dev data is
dropping collections on the Atlas dev cluster, not `docker compose down -v`. Production deploys
need the VM's egress IP allowlisted on the Atlas project before the API container can connect —
documented in [`manual_deploy.md`](manual_deploy.md). Every developer and every deploy target
needs network access to Atlas, which a fully offline/local-only setup (driverzone's default) does
not require.

**Refs:** `docker-compose.dev.yml`, `docker-compose.prod.yml`, `apps/api/.env.example`,
`apps/api/.env.prod.example`, [`setup-development.md`](setup-development.md)

---

## 2026-09-23 — Web portal is Next.js

**Decision:** `apps/web` (Admin/HR/Accountant portal, [`roadmap.md`](roadmap.md) phase 9) is
built on Next.js, matching `../driverzone/apps/web`'s stack and deploy pattern (standalone
output, `NEXT_PUBLIC_*` as Docker build args, same-site cookie auth if the eventual auth design
uses one).

**Why:** no HLD doc had picked a web stack yet — only the mobile stack was decided
(`hld/03-system-architecture.md` §1: React Native + SQLite). `apps/api`'s architecture was
already deliberately aligned to driverzone's (commit `041c5bd`), and Next.js is the specific
choice that keeps the eventual `build-and-deploy.md` and Dockerfile structure a copy of a proven
pattern rather than a second one to maintain.

**Consequences:** none yet — `apps/web` is not scaffolded. This entry exists so the choice is
recorded before Phase 9 starts, not discovered mid-scaffold.

**Refs:** [`roadmap.md`](roadmap.md) phase 9, [`engineering/tech-choices.md`](engineering/tech-choices.md)

---

## 2026-09-19 — Architecture aligned with the driverzone reference (shared kernel, module boundaries, tooling)

**Decision:** `apps/api` adopts the same architecture as `../driverzone/apps/api`: 4-layer
modules (`domain/application/infrastructure/interface`), a `.container.ts` composition root and
a `.public.ts` contract per module, and a `dependency-cruiser`-enforced tier graph
(`MODULE_TIERS`) mapping the 9 ERD modules onto explicit dependency tiers.

**Why:** the same shape had already proven out on a different product, and the specific problem
it solves — a module reaching into another's internals instead of a typed contract — is exactly
as real in a modular Mongoose monolith as it was there. Reusing a working pattern rather than
inventing a second one for a second product.

**Consequences:** `docs/hld/03-system-architecture.md` documents the tier mapping for greynote's
9 modules; `docs/engineering/` (this repo's engineering handbook, written to mirror driverzone's)
documents the pattern itself. The `health` module is the reference implementation every future
module copies from.

**Refs:** commit `041c5bd`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/module-anatomy.md`](engineering/module-anatomy.md)

---

## 2026-09-19 — Mongoose over the prior data-access approach

**Decision:** MongoDB via Mongoose is the persistence layer; Mongoose schema validation is the
primary validation at the persistence boundary, applied only inside each module's
`infrastructure/` adapter.

**Why:** captured in the PRD's switch-to-Mongoose commit; the ERD's ORM-agnostic entity language
(FK/join-table style) maps onto MongoDB with referential integrity enforced in the repository
adapters rather than the database, per `hld/03-system-architecture.md` §4.

**Consequences:** `domain/` and `application/` layers never import Mongoose — domain entities
stay plain TypeScript types — so a schema/model always lives in exactly one module's
`infrastructure/`, never shared, per `module-internals-are-private`.

**Refs:** commit `d52b99e`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md) §4
