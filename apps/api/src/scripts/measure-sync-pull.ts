import http from 'node:http';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { signAccessToken } from '@/shared/http/jwt.util.js';
import { createApp } from '../app.js';

/**
 * Dev tool, read-only (2026-11-27): how much one phone pull costs — database queries and response size — for a few field employees.
 *
 *   pnpm --filter @greynote/api exec tsx src/scripts/measure-sync-pull.ts EMPCODE [EMPCODE…]
 *
 * Runs the API in this process on a free port against MONGO_URI, signs a short-lived token for each employee, and calls `GET /sync/pull`
 * twice: a first pull (nothing on the phone) and a steady one (the phone sends the versions it holds).
 */
async function main(): Promise<void> {
  const codes = process.argv.slice(2);
  await mongoose.connect(env.MONGO_URI);
  let queries = 0;
  let byCollection = new Map<string, number>();
  mongoose.set('debug', (collection: string, method: string) => {
    queries += 1;
    const k = `${collection}.${method}`;
    byCollection.set(k, (byCollection.get(k) ?? 0) + 1);
  });
  const app = createApp();
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const users = await mongoose.connection.db!.collection('users').find({ employeeCode: { $in: codes } }).toArray();
  for (const u of users) {
    const token = signAccessToken({ sub: String(u._id), role: 'FIELD', employeeCode: String(u.employeeCode) });
    const pull = async (query: string, gzip: boolean) => {
      queries = 0;
      byCollection = new Map();
      const started = Date.now();
      // node:http, not fetch: fetch unzips the body, and the size on the wire is what we want.
      const { status, encoding, body } = await new Promise<{ status: number; encoding: string; body: Buffer }>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}/api/sync/pull${query}`, { headers: { authorization: `Bearer ${token}`, 'accept-encoding': gzip ? 'gzip' : 'identity' } }, (res) => {
          const parts: Buffer[] = [];
          res.on('data', (c: Buffer) => parts.push(c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, encoding: String(res.headers['content-encoding'] ?? 'none'), body: Buffer.concat(parts) }));
        });
        req.on('error', reject);
      });
      const top = [...byCollection].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}×${n}`).join(' ');
      return { status, ms: Date.now() - started, queries, top, bytes: body.length, encoding, json: gzip ? null : (JSON.parse(body.toString()) as { data: { sources: Record<string, { version?: string }> } }) };
    };
    const first = await pull('', false);
    const versions = Object.entries(first.json?.data.sources ?? {}).flatMap(([s, e]) => (e.version ? [`v%5B${s}%5D=${e.version}`] : [])).join('&');
    const firstGzip = await pull('', true);
    const steady = await pull(`?${versions}`, true);
    console.warn(
      JSON.stringify({
        employee: `${String(u.employeeCode)} ${String(u.name)}`,
        firstPull: { status: first.status, ms: first.ms, queries: first.queries, top: first.top, kb: Math.round(first.bytes / 1024), gzipKb: Math.round(firstGzip.bytes / 1024), encoding: firstGzip.encoding },
        steadyPull: { status: steady.status, ms: steady.ms, queries: steady.queries, kb: Math.round(steady.bytes / 1024) },
      }),
    );
  }
  server.close();
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
