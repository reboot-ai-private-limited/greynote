import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planChemistBackfill } from './assignmentMigrations.js';
import { refusalReason } from './resetFieldData.js';

/**
 * One-off, run by hand BEFORE deploying the chemist-assignment release (decision-log 2026-11-16). Chemists used to show to whoever held
 * their Route; now they show only to the employees they are assigned to. This assigns every active chemist to each active FIELD employee
 * who holds its Route today, so nobody loses a chemist on the day of the switch. Safe to run twice: pairs already assigned are skipped.
 *
 *   pnpm --filter @greynote/api backfill:chemist-assignments                                     dry run — counts only
 *   pnpm --filter @greynote/api backfill:chemist-assignments -- --apply --confirm-db=<dbname>    writes
 *
 * mongodump first.
 */
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName }, apply ? 'backfilling chemist assignments' : 'dry run');
  if (apply) {
    const reason = refusalReason({ mongoUri: env.MONGO_URI, confirmDb: arg('confirm-db') });
    if (reason) throw new Error(reason);
  }

  const fieldRole = await db.collection('roles').findOne({ name: 'FIELD' });
  if (!fieldRole) throw new Error('No FIELD role found; is this the right database?');
  const eligible = new Set((await db.collection('users').find({ roleId: fieldRole['_id'], status: 'active' }).project({ _id: 1 }).toArray()).map((u) => String(u['_id'])));

  const chemists = (await db.collection('chemists').find({ status: 'active' }).project({ routeId: 1 }).toArray()).map((c) => ({ id: String(c['_id']), routeId: String(c['routeId']) }));
  const holdersByRoute = new Map<string, string[]>();
  for (const a of await db.collection('routeassignments').find({ status: 'active' }).project({ routeId: 1, userId: 1 }).toArray()) {
    const route = String(a['routeId']);
    holdersByRoute.set(route, [...(holdersByRoute.get(route) ?? []), String(a['userId'])]);
  }
  const existing = new Set((await db.collection('chemistassignments').find({ status: 'active' }).project({ chemistId: 1, userId: 1 }).toArray()).map((a) => `${a['chemistId']}:${a['userId']}`));

  const plan = planChemistBackfill({ chemists, holdersByRoute, eligibleUserIds: eligible, existing });
  const withNobody = chemists.filter((c) => !(holdersByRoute.get(c.routeId) ?? []).some((u) => eligible.has(u))).length;
  logger.info({ activeChemists: chemists.length, assignmentsToCreate: plan.length, chemistsNobodyHolds: withNobody }, apply ? 'writing' : 'would write');

  if (!apply) {
    logger.info('dry run — nothing was written. Run again with --apply --confirm-db=<dbname> to write.');
    await mongoose.disconnect();
    return;
  }
  const now = new Date();
  const admin = (await db.collection('users').findOne({ roleId: (await db.collection('roles').findOne({ name: 'ADMIN' }))?.['_id'], status: 'active' }))?.['_id'];
  if (!admin) throw new Error('No active Admin user found to record as the assigner.');
  for (let i = 0; i < plan.length; i += 1000) {
    await db.collection('chemistassignments').insertMany(
      plan.slice(i, i + 1000).map((p) => ({ chemistId: new mongoose.Types.ObjectId(p.chemistId), userId: new mongoose.Types.ObjectId(p.userId), status: 'active', assignedAt: now, assignedBy: admin, unassignedAt: null, unassignedBy: null })),
    );
  }
  logger.info({ created: plan.length }, 'chemist assignments created');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'backfill failed');
  process.exit(1);
});
