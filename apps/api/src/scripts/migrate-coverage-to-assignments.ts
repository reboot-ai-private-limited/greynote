import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { usersToAssign, type Coverage } from './coverageToAssignments.js';

/**
 * One-off, idempotent: assign each active distributor to the active field employees who reached it only by Zone / HQ / Route coverage, because
 * from 2026-11-04 only an assigned distributor shows to an employee. Run before the new API goes live, then trim the lists in the web app.
 *
 *   pnpm --filter @greynote/api migrate:coverage-assignments               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:coverage-assignments -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;

  const routes = new Map((await db.collection('routes').find({}).project({ hqId: 1 }).toArray()).map((r) => [String(r['_id']), String(r['hqId'])]));
  const hqs = new Map((await db.collection('hqs').find({}).project({ zoneId: 1 }).toArray()).map((h) => [String(h['_id']), String(h['zoneId'])]));
  const activeUsers = new Set((await db.collection('users').find({ role: 'FIELD', status: 'active' }).project({ _id: 1 }).toArray()).map((u) => String(u['_id'])));

  const scopes = new Map<string, { zoneIds: Set<string>; hqIds: Set<string>; routeIds: Set<string> }>();
  for await (const a of db.collection('routeassignments').find({ status: 'active' })) {
    const userId = String(a['userId']);
    if (!activeUsers.has(userId)) continue;
    const routeId = String(a['routeId']);
    const hqId = routes.get(routeId);
    const s = scopes.get(userId) ?? { zoneIds: new Set<string>(), hqIds: new Set<string>(), routeIds: new Set<string>() };
    s.routeIds.add(routeId);
    if (hqId) {
      s.hqIds.add(hqId);
      const zoneId = hqs.get(hqId);
      if (zoneId) s.zoneIds.add(zoneId);
    }
    scopes.set(userId, s);
  }
  const plain = new Map<string, Coverage>([...scopes].map(([id, s]) => [id, { zoneIds: [...s.zoneIds], hqIds: [...s.hqIds], routeIds: [...s.routeIds] }]));

  let distributors = 0;
  let additions = 0;
  for await (const d of db.collection('distributors').find({ status: 'active' })) {
    const ids = (k: string): string[] => ((d[k] as unknown[] | undefined) ?? []).map(String);
    const add = usersToAssign({ zoneIds: ids('zoneIds'), hqIds: ids('hqIds'), routeIds: ids('routeIds'), assignedUserIds: ids('assignedUserIds') }, plain);
    if (add.length === 0) continue;
    distributors++;
    additions += add.length;
    logger.info({ id: String(d['_id']), name: d['name'], add }, apply ? 'assigning' : 'would assign');
    if (apply) await db.collection('distributors').updateOne({ _id: d['_id'] }, { $addToSet: { assignedUserIds: { $each: add.map((id) => new mongoose.Types.ObjectId(id)) } } });
  }
  logger.info({ distributors, additions, apply }, apply ? 'done' : 'dry run — nothing written');
  await mongoose.disconnect();
}

main().catch((err: unknown) => {
  logger.error({ err }, 'coverage migration failed');
  process.exit(1);
});
