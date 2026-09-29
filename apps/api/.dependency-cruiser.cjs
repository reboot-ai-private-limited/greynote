/**
 * Machine-checks the architectural invariants that TypeScript cannot see.
 *
 * ESLint (`.eslintrc.cjs`) already blocks the ALIAS spelling of a cross-module import and is
 * the faster feedback loop, so it stays. But `no-restricted-imports` matches the literal
 * source string rather than the resolved file, which makes it structurally unable to do the
 * rules below:
 *
 *  - it cannot see a RELATIVE escape. The obvious pattern for it, `../../*​/domain/*`, matches
 *    the `..` segment and so flags the legal `../../domain/x.js` while missing the illegal
 *    `../../identity/domain/x.js` — exactly backwards.
 *  - it cannot see a CYCLE at all, because a cycle is a property of the graph, not of one import.
 *
 * dependency-cruiser resolves every import to a real path, so how it was spelled stops
 * mattering. ESLint is the echo; this file is the authority.
 */

/**
 * The module dependency graph, as tiers. A module may import only from a STRICTLY LOWER tier.
 *
 * This exists because `no-circular` below cannot enforce it. `no-circular` works on files, and
 * a module-level cycle usually never becomes a file-level one: a `.public.ts` imports nothing
 * but its own domain types, so `identity → territory.public` plus `territory → identity.public`
 * is two modules depending on each other with no file cycle anywhere to find.
 *
 * Same-tier imports are forbidden too. Two modules on one tier importing each other is exactly
 * the mutual coupling this prevents, so a genuine dependency between them means one of them
 * belongs on a higher tier.
 *
 * Tiers mirror docs/hld/03-system-architecture.md §3 exactly. Most of these module folders
 * don't exist in `src/modules/` yet — that's fine, an unmatched tier entry is a no-op regex,
 * not an error. **Adding a module means creating its folder inside the tier it's already
 * listed under here** (or, if the tier mapping itself needs to change, updating this file is
 * the decision to make deliberately, not a side effect of scaffolding the module).
 */
const MODULE_TIERS = [
    ['health', 'config'], //          Tier 0 — SystemConfig; no dependencies
    ['identity'], //                  Tier 1 — User, Role, Designation, PayBand, UserSession
    ['territory', 'approval', 'sync'], // Tier 2 — Zone, HQ, Area, Route, RouteAssignment; ApprovalRequest; SyncReceipt
    ['field-master-data', 'planning', 'hr'], //  Tier 3 — Doctor/Chemist/Distributor/Product/
    //                                            allocations; DailyPlan/MonthlyPlan; leave & holidays
    ['field-activity', 'sales'], //   Tier 4 — DCR/calls/expenses; Order/MonthlyStock
    ['marketing', 'payroll'], //      Tier 5 — Visual/Campaign/Target (reads Sales' order totals); PayrollRun. Top of the graph
];

const layeringRules = MODULE_TIERS.map((tier, index) => {
    const below = MODULE_TIERS.slice(0, index).flat();
    return {
        name: `tier-${index}-${tier.join('-')}`,
        comment:
            `${tier.join(' and ')} may import only: ${below.join(', ') || '(no other module)'}. ` +
            'An import pointing sideways or upward means either the dependency is backwards, or this ' +
            'module belongs on a different tier — decide which before editing MODULE_TIERS.',
        severity: 'error',
        from: { path: `^src/modules/(${tier.join('|')})/` },
        to: {
            path: '^src/modules/[^/]+/',
            pathNot: [`^src/modules/$1/`, ...(below.length ? [`^src/modules/(${below.join('|')})/`] : [])],
        },
    };
});

module.exports = {
    options: {
        doNotFollow: { path: 'node_modules' },

        /*
         * Resolves the `@/*` alias. Without it every aliased import becomes unresolvable, and
         * since an unresolvable import has no `to` path, EVERY rule below would pass
         * vacuously — a green that means nothing. `not-to-unresolvable` is what turns that
         * failure mode into a loud one.
         */
        tsConfig: { fileName: 'tsconfig.json' },

        /*
         * Required, and the least obvious setting here. Without it dependency-cruiser ignores
         * `import type` — and a layer violation is very often type-only. Off, this reports a
         * clean tree that is not clean.
         */
        tsPreCompilationDeps: true,

        /*
         * ESM/NodeNext: a .ts source imports its sibling as './x.js', so .ts must resolve
         * first. `exportsFields`/`conditionNames` are what let `@greynote/contracts` resolve
         * once it exists and publishes TypeScript source via `exports: { ".": "./src/index.ts" }`.
         */
        enhancedResolveOptions: {
            extensions: ['.ts', '.js', '.json'],
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default'],
        },
    },

    forbidden: [
        {
            name: 'not-to-unresolvable',
            comment:
                'An import that resolves to nothing. Usually a typo or a missing .js extension — but ' +
                'if it is the @/ alias failing wholesale, every other rule here has silently stopped ' +
                'checking anything. Treat a spike as the config being broken, not the code.',
            severity: 'error',
            from: { path: '^src' },
            to: { couldNotResolve: true },
        },

        {
            name: 'no-circular',
            comment:
                'A cycle between FILES. TypeScript compiles one happily and ESM resolves it at ' +
                'runtime, so it surfaces as an `undefined` dependency while a container is being ' +
                'constructed — far from the import that caused it.',
            severity: 'error',
            from: { path: '^src' },
            to: { circular: true },
        },

        {
            name: 'module-internals-are-private',
            comment:
                "A module's layers, its container and every other file at its root are private. " +
                "Cross-module means '<name>.public.ts', nothing else. Because this matches resolved " +
                'paths it closes the relative-escape, container and module-root holes at once, ' +
                'whichever way the import is spelled.',
            severity: 'error',
            from: { path: '^src/modules/([^/]+)/' },
            to: {
                path: '^src/modules/[^/]+/',
                pathNot: [
                    // Your own module — reach into it however you like.
                    '^src/modules/$1/',
                    // Any module's public contract — the one legal way across.
                    '^src/modules/[^/]+/[^/]+\\.public\\.ts$',
                ],
            },
        },

        {
            name: 'domain-imports-nothing-above-it',
            comment:
                'domain/ is the innermost layer: entities, value objects and the PORTS describing ' +
                'what it needs. It must not know a Mongoose model or an Express route exists. A ' +
                'type-only import counts — importing a type from infrastructure/ still means the ' +
                'schema, not the domain, owns that shape.',
            severity: 'error',
            from: { path: '^src/modules/[^/]+/domain/' },
            to: { path: '^src/modules/[^/]+/(application|infrastructure|interface)/' },
        },

        {
            name: 'application-depends-on-ports-not-adapters',
            comment:
                'A use case depends on the port in domain/, never on the concrete adapter ' +
                'implementing it. Typing a field against the class instead of the interface is what ' +
                'makes a use case untestable without the real thing — the container is the only ' +
                'place allowed to name an adapter.',
            severity: 'error',
            from: { path: '^src/modules/[^/]+/application/' },
            to: { path: '^src/modules/[^/]+/(infrastructure|interface)/' },
        },

        {
            name: 'interface-depends-on-ports-not-adapters',
            comment:
                'Same rule as the layer below: controllers and routers are handed what they need ' +
                'by the container and type it against a port.',
            severity: 'error',
            from: { path: '^src/modules/[^/]+/interface/' },
            to: { path: '^src/modules/[^/]+/infrastructure/' },
        },

        {
            name: 'shared-is-below-modules',
            comment:
                'shared/ sits below every module — errors, logging, http. An import pointing the ' +
                'other way inverts that and puts every module on the shortest path to a cycle.',
            severity: 'error',
            from: { path: '^src/shared/' },
            to: { path: '^src/modules/' },
        },

        ...layeringRules,
    ],
};
