import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planRouteKm, type HqRow, type OldRoute } from './routeKm.js';

/**
 * One-off, idempotent: Routes move from the map version to "HQ + destination name + typed km"
 * (decision-log 2026-10-14).
 *
 *   Route: destination (a map pin) → destinationName (the first part of its label); name becomes
 *          "<HQ> to <destination>"; the distance already stored is kept as it is; distanceSource,
 *          distanceStatus, distanceCalculatedAt, revision and destination are removed.
 *   HQ:    basePlace is removed.
 *
 * Run it BEFORE starting the version that reads the new shape, in every environment:
 *
 *   pnpm --filter @greynote/api migrate:route-km                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:route-km -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:route-km -- --apply --backup ./route-km-backup.json
 *
 * (Built: `node dist/scripts/migrate-route-km.js [--apply] [--backup file]`.) Safe to repeat.
 * Routes that had no distance (the map lookup failed) are listed: type their km in the portal.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./route-km-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'route km migration');

  const routes = (await db.collection('routes').find().toArray()) as unknown as OldRoute[];
  const hqs = (await db.collection('hqs').find().toArray()) as unknown as HqRow[];
  const { changes, noKm, renamed, problems } = planRouteKm({ routes, hqs });

  for (const r of renamed) logger.warn({ routeId: String(r.id), from: r.from, to: r.to }, 'two routes of one HQ shared a destination — kept the old route name');
  for (const r of noKm) logger.warn({ routeId: String(r.id), route: r.name }, 'route has no km — type it in the portal');
  if (problems.length > 0) {
    for (const p of problems) logger.error(p);
    throw new Error(`${problems.length} route(s) can't be converted — nothing was written.`);
  }

  const hqsWithBase = await db.collection('hqs').countDocuments({ basePlace: { $exists: true } });
  if (changes.length === 0 && hqsWithBase === 0) {
    logger.info('nothing to convert — already migrated');
    return;
  }
  if (!apply) {
    logger.info({ routes: changes.length, hqsToClean: hqsWithBase }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify({ routes: routes.filter((r) => changes.some((c) => c.id === r._id)), hqs }, null, 2));
  logger.info({ backupPath }, 'backup written');

  for (const c of changes) {
    await db.collection('routes').updateOne({ _id: c.id as never }, { $set: c.$set, $unset: c.$unset });
  }
  await db.collection('hqs').updateMany({}, { $unset: { basePlace: '' } });

  const left = await db.collection('routes').countDocuments({ $or: [{ destinationName: { $exists: false } }, { destination: { $exists: true } }] });
  if (left > 0) throw new Error(`verification failed: ${left} route(s) still in the old shape.`);
  logger.info({ routes: changes.length, noKm: noKm.length }, 'routes converted and verified');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'route km migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
