import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { buildDownlines, planCopiedRouteCleanup } from './assignmentMigrations.js';
import { refusalReason } from './resetFieldData.js';

/**
 * One-off, run by hand AFTER deploying the derived-territory release (decision-log 2026-11-16). Managers were handed their team's routes
 * when an employee was placed under them; territory is now computed from the team, so those copies are dead weight (and go stale).
 * This ends a manager's route row (kept as history, like offboarding does) only when someone below them also holds the route and the
 * manager has no doctor of their own there. Anything else is listed, not touched. Safe to run twice.
 *
 *   pnpm --filter @greynote/api cleanup:manager-routes                                     dry run — per-manager counts
 *   pnpm --filter @greynote/api cleanup:manager-routes -- --apply --confirm-db=<dbname>    ends the copies
 *
 * mongodump first.
 */
const arg = (name: string): string | undefined => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName }, apply ? 'ending copied manager routes' : 'dry run');
  if (apply) {
    const reason = refusalReason({ mongoUri: env.MONGO_URI, confirmDb: arg('confirm-db') });
    if (reason) throw new Error(reason);
  }

  const managerOf = new Map<string, string | null>();
  for (const p of await db.collection('employeeprofiles').find({}).project({ userId: 1, managerId: 1 }).toArray()) managerOf.set(String(p['userId']), p['managerId'] ? String(p['managerId']) : null);
  const downlineOf = buildDownlines(managerOf);

  const assignments = (await db.collection('routeassignments').find({ status: 'active' }).project({ routeId: 1, userId: 1 }).toArray()).map((a) => ({ id: String(a['_id']), routeId: String(a['routeId']), userId: String(a['userId']) }));

  // `userId:routeId` where the user personally holds an active doctor on that route.
  const doctorRoute = new Map((await db.collection('doctors').find({}).project({ routeId: 1 }).toArray()).map((d) => [String(d['_id']), String(d['routeId'])]));
  const ownDoctorRoutes = new Set<string>();
  for (const a of await db.collection('doctorassignments').find({ status: 'active' }).project({ doctorId: 1, userId: 1 }).toArray()) {
    const route = doctorRoute.get(String(a['doctorId']));
    if (route) ownDoctorRoutes.add(`${a['userId']}:${route}`);
  }

  const plan = planCopiedRouteCleanup({ assignments, downlineOf, ownDoctorRoutes });
  const perManager = new Map<string, number>();
  const byId = new Map(assignments.map((a) => [a.id, a]));
  for (const id of plan.toEnd) perManager.set(byId.get(id)!.userId, (perManager.get(byId.get(id)!.userId) ?? 0) + 1);
  logger.info({ rowsToEnd: plan.toEnd.length, managersAffected: perManager.size, keptNoOneBelow: plan.kept.filter((k) => k.reason === 'NO_ONE_BELOW_HOLDS_IT').length, keptOwnDoctors: plan.kept.filter((k) => k.reason === 'MANAGER_HAS_OWN_DOCTORS_THERE').length }, apply ? 'ending' : 'would end');
  logger.info({ perManager: Object.fromEntries(perManager) }, 'rows per manager');

  if (!apply) {
    logger.info('dry run — nothing was written. Run again with --apply --confirm-db=<dbname> to end them.');
    await mongoose.disconnect();
    return;
  }
  const ids = plan.toEnd.map((id) => new mongoose.Types.ObjectId(id));
  const result = await db.collection('routeassignments').updateMany({ _id: { $in: ids }, status: 'active' }, { $set: { status: 'inactive', unassignedAt: new Date(), unassignedBy: null } });
  logger.info({ ended: result.modifiedCount }, 'copied manager routes ended');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'cleanup failed');
  process.exit(1);
});
