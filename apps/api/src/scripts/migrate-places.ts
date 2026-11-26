import { writeFileSync } from 'node:fs';
import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { PlaceModel } from '@/modules/territory/infrastructure/place.schema.js';
import { RouteModel } from '@/modules/territory/infrastructure/route.schema.js';
import { planPlaces, type MigHq, type MigPlace, type MigRoute } from './placesMigration.js';

/**
 * One-off, idempotent (decision-log 2026-11-26): Places come in. Every HQ gets its town place; every route
 * "<HQ> to <destination>" becomes HQ town ↔ a place named after the destination, with the route's type. Route ids,
 * names, km and TA rates are kept, so plans, calls and claims that point at them are unchanged.
 *
 *   pnpm --filter @greynote/api migrate:places                     dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:places -- --apply          writes; saves a backup of the routes first
 *
 * Take a mongodump first in production. Run it before using the new Places screens. Safe to repeat.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./places-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'places migration');

  const hqs = (await db.collection('hqs').find().toArray()) as unknown as MigHq[];
  const places = (await db.collection('places').find().toArray()) as unknown as MigPlace[];
  const routes = (await db.collection('routes').find().toArray()) as unknown as MigRoute[];
  const plan = planPlaces({ hqs, places, routes, newId: () => new Types.ObjectId().toHexString() });

  for (const name of plan.selfRoutes) logger.info({ route: name }, 'route inside the HQ town: kept as town ↔ town');
  if (plan.problems.length > 0) {
    for (const p of plan.problems) logger.error(p);
    throw new Error(`${plan.problems.length} problem(s) — nothing was written.`);
  }
  if (plan.places.length === 0 && plan.routes.length === 0) {
    logger.info('nothing to do — already migrated');
    return;
  }
  const report = {
    hqTowns: plan.places.filter((p) => p.isHqTown).length,
    places: plan.places.filter((p) => !p.isHqTown).length,
    routes: plan.routes.length,
    selfRoutes: plan.selfRoutes.length,
  };
  if (!apply) {
    logger.info(report, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify({ routes: routes.filter((r) => plan.routes.some((c) => String(c.id) === String(r._id))) }, null, 2));
  logger.info({ backupPath }, 'backup written');

  // The indexes the new code relies on (one town per HQ, one route per pair) exist before anything is written.
  await PlaceModel.createIndexes();
  await RouteModel.createIndexes();

  if (plan.places.length > 0) {
    await PlaceModel.insertMany(plan.places.map((p) => ({ ...p, _id: new Types.ObjectId(p._id), hqId: new Types.ObjectId(p.hqId) })));
  }
  for (const r of plan.routes) {
    await db.collection('routes').updateOne(
      { _id: r.id as never, fromPlaceId: { $in: [null, undefined] } as never },
      {
        $set: {
          fromPlaceId: new Types.ObjectId(r.fromPlaceId),
          toPlaceId: new Types.ObjectId(r.toPlaceId),
          pairKey: r.pairKey,
          taFixedPaise: null,
        },
      },
    );
  }

  const left = await db.collection('routes').countDocuments({ $or: [{ fromPlaceId: null }, { fromPlaceId: { $exists: false } }] });
  const towns = await db.collection('places').countDocuments({ isHqTown: true });
  if (left > 0 || towns < hqs.length) throw new Error(`verification failed: ${left} route(s) without places, ${towns}/${hqs.length} HQ towns.`);
  logger.info(report, 'places created and routes linked, verified');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'places migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
