import { writeFileSync } from 'node:fs';
import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planOutletPlaces, type MigDistributor, type MigOnRoute, type MigRouteEnds } from './outletPlacesMigration.js';

/**
 * One-off, idempotent (decision-log 2026-11-26, phase 3): doctors and chemists get the To place of their route (their `routeId` stays);
 * distributors get the places of their routes. Run AFTER `migrate:places`, before using the new screens.
 *
 *   pnpm --filter @greynote/api migrate:outlet-places                dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:outlet-places -- --apply     writes; saves a backup first
 *
 * Distributors keep their `routeIds` too (old phones read them); they are now served by places. Safe to repeat.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./outlet-places-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'outlet places migration');

  const fields = { projection: { name: 1, routeId: 1, placeId: 1, routeIds: 1, placeIds: 1, toPlaceId: 1 } };
  const routes = (await db.collection('routes').find({}, fields).toArray()) as unknown as MigRouteEnds[];
  const doctors = (await db.collection('doctors').find({}, fields).toArray()) as unknown as MigOnRoute[];
  const chemists = (await db.collection('chemists').find({}, fields).toArray()) as unknown as MigOnRoute[];
  const distributors = (await db.collection('distributors').find({}, fields).toArray()) as unknown as MigDistributor[];
  const plan = planOutletPlaces({ routes, doctors, chemists, distributors });

  for (const u of plan.unplaced) logger.warn(u + ' — its route has no place: set one in the portal');
  const report = { doctors: plan.doctors.length, chemists: plan.chemists.length, distributors: plan.distributors.length, unplaced: plan.unplaced.length };
  if (report.doctors + report.chemists + report.distributors === 0) {
    logger.info(report, 'nothing to do — already migrated');
    return;
  }
  if (!apply) {
    logger.info(report, 'dry run only — repeat with --apply to write');
    return;
  }
  writeFileSync(backupPath!, JSON.stringify({ distributors: distributors.filter((d) => plan.distributors.some((p) => String(p.id) === String(d._id))) }, null, 2));
  logger.info({ backupPath }, 'backup written');

  const oid = (id: string) => new Types.ObjectId(id);
  for (const d of plan.doctors) await db.collection('doctors').updateOne({ _id: d.id as never }, { $set: { placeId: oid(d.placeId) } });
  for (const c of plan.chemists) await db.collection('chemists').updateOne({ _id: c.id as never }, { $set: { placeId: oid(c.placeId) } });
  for (const x of plan.distributors) await db.collection('distributors').updateOne({ _id: x.id as never }, { $set: { placeIds: x.placeIds.map(oid) } });

  const left = await db.collection('doctors').countDocuments({ $or: [{ placeId: null }, { placeId: { $exists: false } }] });
  logger.info({ ...report, doctorsStillWithoutPlace: left }, 'outlets placed');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'outlet places migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
