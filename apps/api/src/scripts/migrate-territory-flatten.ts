import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planTerritoryFlatten, type HqDoc, type OldArea, type OldRoute } from './territoryFlatten.js';

/**
 * One-off, idempotent: `Zone → HQ → Area → Route` becomes `Zone → HQ → Route` (decision-log 2026-10-03).
 *
 *   Route: areaId → hqId (the Area's HQ), type (the Area's type), waypoints → destination (the last one)
 *   Area:  the `areas` collection is dropped, after a backup
 *   HQ:    gets NO base place — the script only reports where each one's routes used to start, as a
 *          suggestion. An Admin sets the real base place in the portal, which recalculates the HQ's
 *          routes from it.
 *
 * Run it BEFORE starting the version that reads the new shape, in every environment:
 *
 *   pnpm --filter @greynote/api migrate:territory                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:territory -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:territory -- --apply --backup ./territory-backup.json
 *
 * (Built: `node dist/scripts/migrate-territory-flatten.js [--apply] [--backup file]`.) Safe to repeat.
 * A Route that can't be converted exactly (no Area, no waypoints, or a name that would now clash
 * under its HQ) stops the whole run before anything is written. Distances already stored are kept
 * as they are until the HQ's base place is set.
 */

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./territory-migration-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'territory migration');

  const hasAreas = (await db.listCollections({ name: 'areas' }).toArray()).length > 0;
  const areas = hasAreas ? ((await db.collection('areas').find().toArray()) as unknown as OldArea[]) : [];
  const routes = (await db.collection('routes').find().toArray()) as unknown as OldRoute[];
  const hqs = (await db.collection('hqs').find().toArray()) as unknown as HqDoc[];

  const { changes, problems, basePlaceSuggestions } = planTerritoryFlatten({ areas, routes, hqs });

  for (const s of basePlaceSuggestions) {
    logger.info({ hqId: String(s.hqId), hq: s.hqName, suggestedBasePlace: s.suggested }, 'HQ has no base place — set it in the portal');
  }
  if (problems.length > 0) {
    for (const p of problems) logger.error(p);
    throw new Error(`${problems.length} route(s) can't be converted exactly — nothing was written. Fix them and run again.`);
  }
  if (changes.length === 0 && !hasAreas) {
    logger.info('nothing to convert — already migrated');
    return;
  }
  if (!apply) {
    logger.info({ routes: changes.length, areasToDrop: areas.length }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify({ areas, routes: routes.filter((r) => changes.some((c) => c.id === r._id)) }, null, 2));
  logger.info({ backupPath }, 'backup written');

  for (const c of changes) {
    await db.collection('routes').updateOne({ _id: c.id as never }, { $set: c.$set, $unset: c.$unset });
  }

  // The unique name index moves from {areaId, nameKey} to {hqId, nameKey}.
  const routeIndexes = await db.collection('routes').indexes();
  for (const index of routeIndexes) {
    if (index.key && 'areaId' in index.key && index.name) await db.collection('routes').dropIndex(index.name);
  }
  await db.collection('routes').createIndex({ hqId: 1, nameKey: 1 }, { unique: true });

  const leftovers = await db.collection('routes').countDocuments({ $or: [{ areaId: { $exists: true } }, { waypoints: { $exists: true } }] });
  const incomplete = await db.collection('routes').countDocuments({ $or: [{ hqId: { $exists: false } }, { type: { $exists: false } }, { destination: { $exists: false } }] });
  if (leftovers > 0 || incomplete > 0) {
    throw new Error(`verification failed: ${leftovers} route(s) with old fields left, ${incomplete} without the new ones. The areas collection was NOT dropped.`);
  }
  if (hasAreas) await db.collection('areas').drop();
  logger.info({ routes: changes.length, areasDropped: areas.length }, 'territory flattened and verified');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'territory migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
