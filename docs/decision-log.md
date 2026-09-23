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

## 2026-09-23 — Identity's `User` gains onboarding fields, a `pending` status, and defers Zone/HQ

**Decision:** `User` (ERD Module 1) grows beyond `docs/erd/01-identity-hierarchy.md`'s original
field list to support a step-by-step Admin onboarding flow for FIELD employees: personal details
(`mobile_number`, `guardian_name`, `date_of_birth`, `address`, `qualification`), bank details
(`bank_name`, `ifsc`, `account_number`, `account_holder_name`, `branch_name`), and an array of
uploaded documents. `status` widens from `active/inactive` to `active/pending/inactive` —
`pending` means onboarding incomplete, kept distinct from `inactive` (deactivated/offboarded) so a
future Payroll query for "active FIELD employees" can't accidentally include someone
mid-onboarding. `status` is auto-computed (not a separate "activate" action) every time
`PATCH /api/identity/users/:id` changes one of the required-for-activation fields — see
`domain/onboarding.ts`'s `computeUserStatus`, which never upgrades an already-`inactive` user back
to `active`/`pending` as a side effect. Zone→HQ is deliberately **not** added here — Territory
(Phase 2, one tier above Identity) doesn't exist yet, and ERD-01's own "Next" section already
planned for that FK to land with Module 2, not Module 1.

**Why:** the PRD/ERD didn't originally specify these fields, but real Admin onboarding needs them,
and a FIELD employee shouldn't be usable (assignable, able to submit) until the record is actually
complete. Auto-computing status (rather than a manual activate call) means every onboarding PATCH
naturally converges on `active` the moment the last required field lands.

**Consequences:** `docs/erd/01-identity-hierarchy.md` needs its `User` entity and `status` field
updated to match this. `docs/LLD/identity.md`'s HTTP surface table gains
`POST /users/:id/documents` and `DELETE /users/:id/documents/:documentId`, and its create-user
row should note the discriminated payload shape (decision below).

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,onboarding}.ts`

---

## 2026-09-23 — One `POST /api/identity/users`, discriminated by role

**Decision:** the LLD's single `POST /api/identity/users` endpoint takes a Zod discriminated
union on `role`: a `FIELD` payload accepts the full onboarding shape (minimal at creation,
filled in incrementally via `PATCH`); an `ADMIN`/`HR`/`ACCOUNTANT` payload — the "user master"
path — is the short form (`employeeCode, name, email, phone, password, role` only), created
`active` immediately. Creating a non-FIELD user is Admin-only; creating a FIELD user is Admin or
HR, per the LLD's existing HR-field-force-only restriction. Enforced in `CreateUserUseCase`, not
just at the route.

**Why:** keeps the one HTTP surface the LLD already documents rather than adding a second
endpoint, while still giving Admin/HR/Accountant creation ("user master") a genuinely simpler
shape than FIELD onboarding — none of designation/pay-band/bank/manager/documents applies to them.

**Refs:** `apps/api/src/modules/identity/application/usecases/createUser.usecase.ts`,
`interface/users.schemas.ts`

---

## 2026-09-23 — Password hashing: bcrypt, with its 72-byte limit enforced not truncated

**Decision:** `bcrypt` (the `bcrypt` npm package, cost factor from `BCRYPT_COST_FACTOR`, default
12) hashes every `User.passwordHash`. Its 72-byte input limit is enforced at the Zod DTO layer
(`Buffer.byteLength(password, 'utf8') <= 72`, rejected with 400) on both password creation and
login — not silently truncated, which would otherwise let two different passwords sharing the
same first-72-byte prefix hash (and authenticate) identically.

**Why:** `docs/engineering/tech-choices.md` and `.env.example` had left bcrypt vs. argon2 open.
bcrypt ships prebuilt native bindings for common deploy targets (no build-toolchain risk the way
`argon2`'s native addon can carry) and is the specific standard for password hashing.

**Refs:** `apps/api/src/modules/identity/infrastructure/bcryptPasswordHasher.adapter.ts`,
`interface/password.schema.ts`

---

## 2026-09-23 — Bootstrap Admin seeded from env vars, exactly once

**Decision:** `identity`'s boot sequence seeds exactly one `ADMIN`-role `User` from
`BOOTSTRAP_ADMIN_*` env vars, gated on "does any ADMIN-role user exist" (not a one-time flag, so
it self-heals if the DB is ever reset) rather than a fixed run-once marker. Every Admin/HR/
Accountant after that first one is created the ordinary way — through that Admin's own
authenticated `POST /api/identity/users` call.

**Why:** creating a `User` normally requires an authenticated Admin, which is impossible on a
genuinely empty DB — this is the one exception, solving the chicken-and-egg problem without a
second, permanently-open creation path.

**Refs:** `apps/api/src/modules/identity/application/usecases/seedBootstrapAdmin.usecase.ts`

---

## 2026-09-23 — Money storage: `Decimal128`, provisional pending Payroll

**Decision:** `PayBand.base_salary/ta_per_km_rate/da_amount` (the first money fields to land) use
Mongoose `Decimal128` in `infrastructure/payBand.schema.ts`. The domain entity keeps them as
decimal **strings** — `domain/` never imports Mongoose (2026-09-19 decision) — so the conversion
lives only in `infrastructure/mongoPayBand.adapter.ts`.

**Why:** `docs/engineering/coding-standards.md#money` flagged this as undecided but required
before Phase 1, and named `Decimal128` as its own standing fallback pending a final choice against
driverzone's integer-subunit convention. Deliberately **provisional** — this entry exists so
Payroll (Phase 7) either ratifies or deliberately overrides it, not silently inherits it.

**Refs:** `docs/engineering/coding-standards.md#money`,
`apps/api/src/modules/identity/infrastructure/{payBand.schema,mongoPayBand.adapter}.ts`

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
