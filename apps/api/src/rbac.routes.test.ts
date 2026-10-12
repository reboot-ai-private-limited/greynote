import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

/**
 * The role-by-route table (docs/testing/01-access-roles.md): every route in the API, with the roles its `requireRole(...)` lets in —
 * `ANY` for a signed-in user of any role, `PUBLIC` for a route with no sign-in. It is compared with `rbac.matrix.txt`, so widening or
 * narrowing who may call a route shows up as a diff to review rather than going unnoticed. After a deliberate change, regenerate with
 *   UPDATE_RBAC=1 pnpm --filter @greynote/api exec vitest run src/rbac.routes.test.ts
 * and read the diff in git before committing it.
 */
type Handler = { allowedRoles?: string[]; authenticates?: boolean; stack?: Layer[] };
type Layer = {
  route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> };
  name?: string;
  handle: Handler;
  regexp?: { source: string; fast_slash?: boolean };
};
/** What the guards met so far (`router.use(authenticate(), requireRole(...))` and the like) say about the routes after them. */
interface Guards {
  authenticated: boolean;
  roles: string[] | undefined;
}

function mountOf(layer: Layer): string {
  if (layer.regexp?.fast_slash) return '';
  return (layer.regexp?.source ?? '').replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/');
}

function collect(stack: Layer[], prefix = '', inherited: Guards = { authenticated: false, roles: undefined }): string[] {
  const out: string[] = [];
  let guards = inherited;
  for (const layer of stack) {
    if (layer.route) {
      const path = (prefix + layer.route.path).replace(/(.)\/$/, '$1');
      const handlers = layer.route.stack.map((l) => l.handle);
      const roles = handlers.find((h) => h.allowedRoles)?.allowedRoles ?? guards.roles;
      const authenticated = guards.authenticated || handlers.some((h) => h.authenticates);
      for (const method of Object.keys(layer.route.methods).filter((m) => layer.route?.methods[m])) {
        out.push(`${method.toUpperCase().padEnd(6)} ${path}  ${roles ? [...roles].sort().join(',') : authenticated ? 'ANY' : 'PUBLIC'}`);
      }
    } else if (layer.name === 'router' && layer.handle.stack) {
      out.push(...collect(layer.handle.stack, prefix + mountOf(layer), guards));
    } else if (layer.handle.authenticates || layer.handle.allowedRoles) {
      guards = { authenticated: guards.authenticated || layer.handle.authenticates === true, roles: layer.handle.allowedRoles ?? guards.roles };
    }
  }
  return out;
}

const FILE = new URL('./rbac.matrix.txt', import.meta.url);

describe('role-by-route matrix', () => {
  const actual = `${collect((createApp() as unknown as { _router: { stack: Layer[] } })._router.stack).sort().join('\n')}\n`;

  it('matches the committed table', () => {
    if (process.env.UPDATE_RBAC === '1') writeFileSync(FILE, actual);
    expect(actual).toBe(readFileSync(FILE, 'utf8'));
  });

  it('keeps every report and the Orders list to Admin only', () => {
    const lines = actual.split('\n').filter((l) => /\/api\/reports\//.test(l));
    expect(lines.length).toBeGreaterThan(8);
    // The Sales Dashboard and the employee view are the exceptions: a manager reads them too (the employee their own), and the reports limit them to the downline.
    const open = ['/api/reports/sales-dashboard', '/api/reports/team/overview', '/api/reports/employee-sales', '/api/reports/doctor-visits'];
    // /reports/me/* are the employee's own: FIELD only, never a userId to send.
    for (const l of lines.filter((x) => x.includes('/api/reports/me/'))) expect(l.endsWith('  FIELD'), l).toBe(true);
    for (const l of lines.filter((x) => !x.includes('/api/reports/me/') && !open.some((o) => x.includes(o)))) expect(l.endsWith('  ADMIN'), l).toBe(true);
    for (const o of open) expect(lines.some((l) => l.endsWith(`${o}  ADMIN,FIELD`))).toBe(true);
  });
});
