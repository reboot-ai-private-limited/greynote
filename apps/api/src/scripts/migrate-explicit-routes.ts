import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planExplicitRoutes } from './explicitRoutes.js';

/**
 * One-off, idempotent: routes are only what is stored now. Before, anyone covering an HQ (or a Zone that names none of its HQs) was handed every
 * route of it at read time when they had none stored there. This stores those routes for MR, ASM and RSM, so nobody's list changes on deploy.
 * Run it BEFORE (or with) the version that removes the read-time fallback; after it, nobody loses a route.
 *
 *   pnpm --filter @greynote/api migrate:explicit-routes                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:explicit-routes -- --apply            writes; saves a backup list first
 *   pnpm --filter @greynote/api migrate:explicit-routes -- --apply --backup ./explicit-routes-backup.json
 */
const FIELD_LEVELS = new Set(['MR', 'ASM', 'RSM']);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./explicit-routes-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'explicit routes migration');

  const adminRole = await db.collection('roles').findOne({ name: 'ADMIN' });
  const admin = adminRole ? await db.collection('users').findOne({ roleId: adminRole._id }) : null;
  if (!admin) throw new Error('No Admin user to record as the writer of the new assignments.');

  const designations = new Map((await db.collection('designations').find().toArray()).map((d) => [String(d._id), String(d.name)]));
  const holders = new Set(
    (await db.collection('employeeprofiles').find().toArray())
      .filter((p) => FIELD_LEVELS.has(designations.get(String(p.designationId)) ?? ''))
      .map((p) => String(p.userId)),
  );
  const users = (await db.collection('managercoverages').find().toArray())
    .filter((c) => holders.has(String(c.userId)))
    .map((c) => ({ userId: String(c.userId), hqIds: ((c.hqIds ?? []) as unknown[]).map(String), zoneIds: ((c.zoneIds ?? []) as unknown[]).map(String) }));
  const hqs = (await db.collection('hqs').find().toArray()).map((h) => ({ id: String(h._id), zoneId: String(h.zoneId), status: String(h.status) }));
  const routes = (await db.collection('routes').find().toArray()).map((r) => ({ id: String(r._id), hqId: String(r.hqId), status: String(r.status) }));
  const assignments = (await db.collection('routeassignments').find({ status: 'active' }).toArray()).map((a) => ({ userId: String(a.userId), routeId: String(a.routeId) }));

  const planned = planExplicitRoutes({ users, hqs, routes, assignments });
  const people = new Set(planned.map((p) => p.userId));
  logger.info({ employees: people.size, assignments: planned.length }, 'plan');
  if (planned.length === 0) {
    logger.info('nothing to change — already up to date');
    return;
  }
  if (!apply) {
    logger.info('dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(planned, null, 2));
  logger.info({ backupPath }, 'backup written');
  const oid = (s: string) => new mongoose.Types.ObjectId(s);
  const now = new Date();
  await db.collection('routeassignments').insertMany(
    planned.map((p) => ({ routeId: oid(p.routeId), userId: oid(p.userId), status: 'active', assignedAt: now, assignedBy: admin._id, unassignedAt: null, unassignedBy: null })),
  );
  logger.info({ created: planned.length }, 'assignments written');
}

main()
  .catch((err) => {
    logger.error({ err }, 'explicit routes migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
