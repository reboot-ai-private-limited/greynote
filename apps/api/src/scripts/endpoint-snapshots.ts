import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { signAccessToken } from '@/shared/http/jwt.util.js';
import { createApp } from '../app.js';

/**
 * Dev tool, read-only (2026-11-27): proves a speed change keeps every answer the same, and shows what each answer costs.
 *
 *   tsx src/scripts/endpoint-snapshots.ts record DIR    — saves each case's JSON answer in DIR
 *   tsx src/scripts/endpoint-snapshots.ts compare DIR   — answers again and compares with DIR (exit 1 on any difference)
 *   tsx src/scripts/endpoint-snapshots.ts measure       — time, query count and the most repeated queries per case
 *
 * Runs the API in this process on a free port against MONGO_URI, as an Admin, a manager and an MR (employee codes below; change them to
 * people in your data). Only GET requests.
 */
const MONTH = '2026-11';
const PEOPLE = { admin: 'ADMIN01', manager: 'GHC003', mr: 'GHC014' } as const;
const CASES: Array<{ who: keyof typeof PEOPLE; url: string }> = [
  { who: 'admin', url: `/reports/sales-dashboard?from=${MONTH}-01&to=${MONTH}-27` },
  { who: 'admin', url: `/attendance/payroll-calendar?month=${MONTH}` },
  { who: 'admin', url: `/reports/call-performance?fromMonth=${MONTH}&toMonth=${MONTH}` },
  { who: 'admin', url: `/reports/call-performance?fromMonth=2026-10&toMonth=${MONTH}` },
  { who: 'admin', url: `/reports/doctor-visits?month=${MONTH}` },
  { who: 'admin', url: '/approvals/inbox?page=1&pageSize=50' },
  { who: 'admin', url: '/approvals/all?page=1&pageSize=50' },
  { who: 'manager', url: `/reports/sales-dashboard?from=${MONTH}-01&to=${MONTH}-27` },
  { who: 'manager', url: `/reports/call-performance?fromMonth=${MONTH}&toMonth=${MONTH}` },
  { who: 'manager', url: `/reports/doctor-visits?month=${MONTH}` },
  { who: 'manager', url: '/approvals/inbox?page=1&pageSize=50' },
  { who: 'mr', url: `/reports/call-performance?fromMonth=${MONTH}&toMonth=${MONTH}` },
  { who: 'mr', url: `/reports/doctor-visits?month=${MONTH}` },
];

/** Keys sorted at every level, so two equal answers print the same. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
const fileOf = (dir: string, c: { who: string; url: string }) => path.join(dir, `${c.who}${c.url.replace(/[^a-z0-9]+/gi, '_')}.json`);

async function main(): Promise<void> {
  const [mode, dir] = process.argv.slice(2);
  if (!mode || (mode !== 'measure' && !dir)) throw new Error('Use: record DIR | compare DIR | measure');
  await mongoose.connect(env.MONGO_URI);
  let queries = 0;
  let byKind = new Map<string, number>();
  mongoose.set('debug', (collection: string, method: string) => {
    queries += 1;
    byKind.set(`${collection}.${method}`, (byKind.get(`${collection}.${method}`) ?? 0) + 1);
  });
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const db = mongoose.connection.db!;
  const roles = new Map((await db.collection('roles').find().toArray()).map((r) => [String(r._id), String(r.name)]));
  const tokens = new Map<string, string>();
  for (const [who, code] of Object.entries(PEOPLE)) {
    const u = await db.collection('users').findOne({ employeeCode: code });
    if (!u) throw new Error(`No employee ${code}`);
    tokens.set(who, signAccessToken({ sub: String(u._id), role: (roles.get(String(u.roleId)) ?? 'FIELD') as 'ADMIN', employeeCode: code }));
  }
  const get = (who: string, url: string) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${port}/api${url}`, { headers: { authorization: `Bearer ${tokens.get(who)}` } }, (res) => {
          let body = '';
          res.on('data', (c: Buffer) => (body += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        })
        .on('error', reject);
    });
  await get('admin', '/identity/users?page=1&pageSize=1'); // load models and caches first

  let differences = 0;
  if (dir) mkdirSync(dir, { recursive: true });
  for (const c of CASES) {
    queries = 0;
    byKind = new Map();
    const started = Date.now();
    const res = await get(c.who, c.url);
    const ms = Date.now() - started;
    const answer = JSON.stringify(canonical({ status: res.status, data: (JSON.parse(res.body) as { data?: unknown }).data ?? null }), null, 1);
    if (mode === 'record') writeFileSync(fileOf(dir!, c), answer);
    if (mode === 'compare') {
      const same = readFileSync(fileOf(dir!, c), 'utf8') === answer;
      if (!same) differences += 1;
      console.warn(`${same ? 'same     ' : 'DIFFERENT'} ${c.who.padEnd(7)} ${c.url}`);
    }
    if (mode === 'measure') {
      const top = [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(' ');
      console.warn(`${String(ms).padStart(6)} ms ${String(queries).padStart(5)} q ${res.status} ${c.who.padEnd(7)} ${c.url}   ${top}`);
    }
  }
  server.close();
  await mongoose.disconnect();
  if (differences > 0) {
    console.warn(`${differences} answer(s) differ`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
