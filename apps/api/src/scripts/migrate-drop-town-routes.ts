import mongoose, { Types } from 'mongoose';
import { env } from '@/config/env.js';
import { TerritoryDeletionUseCase } from '@/modules/territory/application/usecases/territoryDeletion.usecase.js';
import { MongoTerritoryDeletionAdapter } from '@/modules/territory/infrastructure/mongoTerritoryDeletion.adapter.js';
import { logger } from '@/shared/logging/logger.js';
import { planDropTownRoutes, type DropOutlet, type DropRoute } from './dropTownRoutesMigration.js';

/**
 * One-off, idempotent (decision-log 2026-11-27): deletes the routes from an HQ town to itself ("SILIGURI to SILIGURI"). A day at one place
 * needs no route and an HQ place pays no TA, so no pay changes. Each goes through the normal permanent delete (history keeps its name from
 * the archive); doctors and chemists on one move to another route of that place first.
 *
 *   pnpm --filter @greynote/api migrate:drop-town-routes                dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:drop-town-routes -- --apply     deletes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'drop town→town routes');

  const str = (v: unknown) => (v == null ? null : String(v));
  const routes: DropRoute[] = (await db.collection('routes').find({}, { projection: { name: 1, fromPlaceId: 1, toPlaceId: 1, status: 1 } }).toArray()).map((r) => ({
    id: String(r._id),
    name: String(r.name),
    fromPlaceId: str(r.fromPlaceId),
    toPlaceId: str(r.toPlaceId),
    status: String(r.status),
  }));
  const outlets = async (name: string): Promise<DropOutlet[]> =>
    (await db.collection(name).find({}, { projection: { routeId: 1 } }).toArray()).map((o) => ({ id: String(o._id), routeId: str(o.routeId) }));
  const plan = planDropTownRoutes({ routes, doctors: await outlets('doctors'), chemists: await outlets('chemists') });

  const report = { routes: plan.routes.length, names: plan.routes.map((r) => r.name), doctorsMoved: plan.doctors.length, chemistsMoved: plan.chemists.length, leftOnOldRoute: plan.leftOnOldRoute };
  if (plan.routes.length === 0) {
    logger.info(report, 'nothing to do — no town→town routes');
    return;
  }
  if (!apply) {
    logger.info(report, 'dry run only — repeat with --apply to delete');
    return;
  }

  const adminRole = await db.collection('roles').findOne({ name: 'ADMIN' }, { projection: { _id: 1 } });
  const admin = adminRole ? await db.collection('users').findOne({ roleId: adminRole._id }, { projection: { _id: 1 } }) : null;
  if (!admin) throw new Error('No ADMIN user to record as the one who deleted them.');
  const oid = (id: string) => new Types.ObjectId(id);
  for (const d of plan.doctors) await db.collection('doctors').updateOne({ _id: oid(d.id) }, { $set: { routeId: oid(d.routeId) } });
  for (const c of plan.chemists) await db.collection('chemists').updateOne({ _id: oid(c.id) }, { $set: { routeId: oid(c.routeId) } });
  const deletion = new TerritoryDeletionUseCase(new MongoTerritoryDeletionAdapter());
  for (const r of plan.routes) await deletion.delete('ROUTE', r.id, String(admin._id));
  logger.info({ ...report, routesLeft: await db.collection('routes').countDocuments() }, 'town→town routes deleted');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'drop town→town routes failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
