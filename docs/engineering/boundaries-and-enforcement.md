# Boundaries & Enforcement

Every rule in `apps/api/.dependency-cruiser.cjs`, what it catches, and what breaks without it.
This file documents the existing config — it does not add new rules; if a rule needs to change,
that file is the one to edit, deliberately.

## Why `dependency-cruiser`, when ESLint already has `no-restricted-imports`

`.dependency-cruiser.cjs`'s own header explains it directly: ESLint matches the **literal import
string**, which can't see a relative escape (`../../identity/domain/x.js` vs the legal
`../../domain/x.js` — the obvious regex gets this backwards) and can't see a **cycle** at all,
since a cycle is a property of the whole graph, not of one import. `dependency-cruiser` resolves
every import to a real file path first, so spelling stops mattering, and it can walk the graph.
ESLint's `no-restricted-imports` still runs too — it's the faster feedback loop in an editor —
but this file is the authority `pnpm lint:deps` actually enforces.

## The tier graph — `MODULE_TIERS`

```js
const MODULE_TIERS = [
    ['health', 'config'],                            // Tier 0 — no dependencies
    ['identity'],                                     // Tier 1
    ['territory', 'approval', 'sync'],                 // Tier 2
    ['field-master-data', 'planning', 'hr'],           // Tier 3
    ['field-activity', 'sales'],                       // Tier 4
    ['attendance'],                                    // Tier 5 — day-by-day status; owns no data
    ['marketing', 'payroll'],                          // Tier 6
    ['reports'],                                       // Tier 7 — read-only reports; top of the graph
];
```

A module may import only from a **strictly lower** tier — never sideways, never up. This mirrors
`docs/hld/03-system-architecture.md` §3 exactly, and it's the same order
[`../roadmap.md`](../roadmap.md) builds in: the tier graph isn't a lint config invented
separately from the roadmap, it **is** the roadmap's dependency order, machine-checked.

**What it catches:** `field-activity` importing from `payroll` (upward — payroll is the
_consumer_ of field-activity's TA/DA data, never the reverse) or `planning` importing from
`hr` (sideways — same tier, and a genuine dependency between two same-tier modules means one of
them is mis-tiered, not that the import is fine).

**What breaks without it:** nothing at compile time — TypeScript is perfectly happy to compile a
sideways import. The break shows up later, as two same-tier modules quietly depending on each
other's internals, at which point untangling them costs much more than a caught lint error would
have. Same-tier same-direction imports (`planning` → `hr` and `hr` → `planning` both existing)
are exactly the kind of mutual coupling a cycle turns into.

**Adding a module** means adding its folder inside the tier it's already listed under — the tier
mapping for all 9 ERD modules is decided (see the table above); only the folder needs creating.
Changing which tier a module belongs in is a deliberate edit to this file, never a side effect of
scaffolding.

## `module-internals-are-private`

A module's `domain/`, `application/`, `infrastructure/`, `interface/` and anything else at its
root are private. The only legal cross-module import is `<name>.public.ts`.

**What it catches:** `planning` importing `identity/domain/user.entity.js` directly instead of
going through `IdentityPublicContract`. Matches resolved paths, so it closes the relative-escape
hole regardless of how the import is spelled.

**What breaks without it:** a Mongoose schema owned by one module gets read or written by
another module's code that never went through the owning module's validation or invariants. In a
system where referential integrity is enforced in application code rather than by the database
(`hld/03-system-architecture.md` §4), that's not a style violation — it's a way to write data
that skips the checks the owning module exists to run.

## `domain-imports-nothing-above-it`

`domain/` — entities and ports — must not import from `application/`, `infrastructure/`, or
`interface/` in the same module. A type-only import counts: importing a type from
`infrastructure/` still means the persistence layer, not the domain, owns that shape.

**What it catches:** a domain entity typed against a Mongoose document instead of a plain object.

**What breaks without it:** a use case becomes untestable without a real Mongo connection, and
the domain model quietly becomes "whatever shape Mongoose happens to produce" instead of a shape
the module deliberately chose.

## `application-depends-on-ports-not-adapters`

A use case in `application/` may depend on the **port** declared in `domain/`, never on the
concrete adapter in `infrastructure/`.

**What it catches:** a use case constructor typed against `MongoHealthProbe` instead of
`HealthProbePort`.

**What breaks without it:** the use case can't be tested with a fake, and the container stops
being the only place allowed to decide which adapter backs a port — the entire reason
`GetHealthUseCase` currently takes `HealthProbePort[]` rather than a concrete class.

## `interface-depends-on-ports-not-adapters`

Same rule, one layer up: controllers and routers are handed what they need by the container and
type it against a port, never an adapter.

## `shared-is-below-modules`

`apps/api/src/shared/` sits below every module. An import pointing the other way — a module
importing something module-specific into `shared/` — inverts the dependency and puts every
module one step from a cycle.

**What it catches:** `shared/http/error-handler.ts` importing something from
`modules/identity/`.

**What breaks without it:** `shared/` stops being safely importable by every module without
risk of a cycle, which is the entire reason code lives there instead of in whichever module
happened to need it first.

## `no-circular`

A cycle between **files** — TypeScript compiles this happily and ESM resolves it at runtime, so
it surfaces as `undefined` during container construction, far from the import that actually
caused it.

## `not-to-unresolvable`

An import that resolves to nothing — usually a typo or a missing `.js` extension (this codebase
is ESM/NodeNext: a `.ts` source imports its sibling as `./x.js`). If this rule spikes across many
files at once, treat it as the `@/` alias resolution being broken, not the code — every other
rule vacuously passes when nothing resolves.

## When a rule blocks you

In order:

1. **Is the data genuinely needed by another module?** Add it to the owning module's
   `.public.ts` contract. This is the design working, not a workaround.
2. **Is the logic genuinely cross-cutting** (needed identically by several modules, like the
   transaction runner in `shared/db/`)? It belongs in `shared/`, not duplicated per module and
   not reached into from one module to another. If it also owns data, it's a module with a
   contract instead — as the approval workflow became.
3. **Does the import point sideways or upward across tiers?** The dependency is backwards, or
   one of the two modules is mis-tiered — resolve which, deliberately, before editing
   `MODULE_TIERS`.

What you should not do: add a path to a rule's `pathNot` exemption list to make one specific
import pass. That's editing the guarantee to fit the violation instead of fixing the violation.
