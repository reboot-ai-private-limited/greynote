# Adding a Module

The checklist for turning one of the 9 ERD modules (or a future one) into code, once
[`../roadmap.md`](../roadmap.md) reaches it. Every step references the real file that already
does this for `health` — copy it rather than starting from a blank file.

1. **Confirm the tier.** All 9 ERD modules already have a tier assignment in
   `apps/api/.dependency-cruiser.cjs`'s `MODULE_TIERS` — check yours is there (it is) before
   writing any code, so you know up front which other modules' `.public.ts` contracts you're
   allowed to depend on.
2. **Copy `apps/api/src/modules/health/`** to `apps/api/src/modules/<name>/`, and rename every
   file's `health`/`Health` prefix to your module's name.
3. **Write `domain/`** first: the entities (matching the relevant `docs/erd/0N-*.md` file) and
   the ports — one interface per external dependency (a Mongoose repository, an external API
   client, another module's `.public.ts` contract if you're consuming one). No Express, no
   Mongoose import here.
4. **Write `application/usecases/`** — one class per use case, constructor-injected against the
   ports from step 3, never a concrete adapter. Match `health`'s `getHealth.usecases.ts` naming:
   `<Verb><Noun>.usecase.ts`.
5. **Write `infrastructure/`** — the concrete adapters. This is where the Mongoose schema/model
   for your module's collection(s) lives, and it lives **only** here — no other module or layer
   may import it.
6. **Write `interface/`** — the Express controller(s) and router, matching your module's HTTP
   surface as specced in its `docs/LLD/<name>.md` doc.
7. **Write `<module>.public.ts`** — the `PublicContract` type. Only expose what another module
   genuinely needs to call; adding to this later is cheap, and a narrow contract is easier to
   reason about than a wide one nobody's using yet.
8. **Write `<module>.container.ts`** — build the adapters, inject them into the use cases, return
   `{ contract, buildRouter }`. Match `health.container.ts`'s shape exactly.
9. **Wire it into `apps/api/src/container.ts`** (add it to `buildContainers()` and the
   `AppContainers` interface) **and `apps/api/src/routes.ts`** (mount its router under `/api/<name>`).
10. **Write the LLD doc**, if it doesn't already exist — `docs/LLD/<name>.md`, following the shape
    in [`../LLD/README.md`](../LLD/README.md). It should already exist by the time you reach this
    step, since `docs/roadmap.md` phases were written against the LLD set — but if the module's
    design changed during implementation, update the doc to match reality, the same discipline
    `../decision-log.md` exists to support.
11. **Run the checks:**
    ```bash
    pnpm --filter @greynote/api typecheck
    pnpm --filter @greynote/api lint         # includes lint:deps — boundary violations fail here
    pnpm --filter @greynote/api build
    ```

## When a module needs something from another module

Import its `.public.ts` contract — nothing else is reachable, and `dependency-cruiser` enforces
this (see [`boundaries-and-enforcement.md`](boundaries-and-enforcement.md)). If the contract
doesn't expose what you need, **add to it** rather than reaching around it; a contract that
grows to fit real consumers is the design working as intended.

If the tier graph says the dependency should point the other way (you need something from a
module in the same or a higher tier), that's a sign either the dependency is genuinely backwards
or one of the two modules is mis-tiered — resolve which before writing the import, not after
`lint:deps` catches it.
