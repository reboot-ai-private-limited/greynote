# Greynote — Engineering Handbook

How this codebase is built and why. If you are new here, read `01`–`03` in order — about 45
minutes, and it covers every decision you need to make sense of the rest.

Decisions already made are logged in [`../decision-log.md`](../decision-log.md).

The product documentation lives one level up in [`../`](../roadmap.md): what Greynote does, the
data model, the cross-cutting mechanisms. This directory is about the _code_.

## Read in this order

| Doc | Answers |
|---|---|
| [Day one](#day-one) | Clone to running stack |
| [Monorepo layout](monorepo-layout.md) | What's in `apps/` vs `packages/`, and where new code goes |
| [Module anatomy](module-anatomy.md) | `.public.ts`, the container, tiers, how a request flows end to end |
| [Boundaries & enforcement](boundaries-and-enforcement.md) | Every `dependency-cruiser` rule, what it catches, what breaks without it |
| [Coding standards](coding-standards.md) | Naming, errors, money, commits, comments |
| [Tech choices](tech-choices.md) | Every dependency: why it's here, what's undecided |
| [Build & deploy](build-and-deploy.md) | Artifacts, the Dockerfile, CI, production topology |
| [Adding a module](adding-a-module.md) | The checklist |

## Day one

The short version is below; [`../setup-development.md`](../setup-development.md) is the full
guide, including the production-style build and troubleshooting.

```bash
git clone <repo-url> && cd greynote
corepack enable && corepack prepare pnpm@11.18.0 --activate
pnpm install

cp apps/api/.env.example apps/api/.env
# edit apps/api/.env — MONGO_URI, an Atlas connection string (no local database to start)

pnpm dev                              # apps/api, :3000
curl localhost:3000/api/health
```

Verify everything at once:

```bash
pnpm check                            # typecheck + lint, everything
```

## The three things worth knowing immediately

**1. Modules talk through `.public.ts` and nothing else.**
`src/modules/planning/` cannot import `src/modules/identity/domain/user.entity.js`. It imports
`identity.public.js`. This is machine-enforced — see `03`. It costs nothing at runtime: the
contract file is types only and leaves no trace in the shipped bundle.

**2. Modules import strictly downward, by tier.**
`.dependency-cruiser.cjs`'s `MODULE_TIERS` is the real dependency graph — Config → Identity →
Territory → {Field Master Data, Planning, HR} → {Field Activity, Sales, Marketing} → Payroll —
and it's the same order [`../roadmap.md`](../roadmap.md) builds in. `pnpm lint:deps` fails the
build on a sideways or upward import; see `03`.

**3. Two error channels, and mixing them up leaks internals or starves the client.**
`AppError`'s `publicDetails` goes to the caller in every environment; `details` is diagnostic,
logged always, stripped in production. Putting a field-validation message in `details` looks
safe locally and quietly breaks every client in production. See `04`.
