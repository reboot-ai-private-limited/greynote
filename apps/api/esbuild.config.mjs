import { readFileSync } from 'node:fs';
import esbuild from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * What stays external, and why the distinction matters.
 *
 * THIRD-PARTY deps stay external. mongoose does dynamic resolution a bundler cannot follow,
 * and `pnpm deploy --prod` copies a real node_modules tree into the image anyway.
 *
 * The `@greynote/*` WORKSPACE packages must be BUNDLED. They publish TypeScript source
 * (`exports: "./src/index.ts"`) rather than a build, so leaving them external means the
 * runtime tries to `import` a .ts file from inside node_modules — and Node refuses:
 *
 *   ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING
 *   Stripping types is currently unsupported for files under node_modules
 *
 * That failure does not appear at build time. The image builds, the layers look right, and the
 * container crashes on its first line.
 */
const external = Object.keys(pkg.dependencies ?? {}).filter((d) => !d.startsWith('@greynote/'));

await esbuild.build({
    // Two entry points, one build: `scripts/seed.ts` is the manual DB-seeding script
    // (docs/decision-log.md — it must run in prod too, via `node dist/scripts/seed.js` inside
    // the container, not just `tsx` in dev). No `outbase` needed — esbuild's default output
    // layout uses each entry's path relative to the lowest common ancestor of all entry points
    // (`src/`), so this lands at `dist/scripts/seed.js` alongside `dist/server.js`.
    entryPoints: ['src/server.ts', 'src/scripts/seed.ts', 'src/scripts/migrate-money-to-paise.ts', 'src/scripts/migrate-territory-flatten.ts', 'src/scripts/run-compliance.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outdir: 'dist',
    sourcemap: true,
    external,
    logLevel: 'info',
});
