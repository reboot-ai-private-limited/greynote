import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planDistributor } from './distributorMigration.js';

/**
 * One-off, idempotent: a Distributor has several Routes and a list of assigned people, and no order flags (decision-log 2026-10-09). Run it before the
 * new API serves distributors, since an old document has no `routeIds` and would not be listed.
 *
 *   pnpm --filter @greynote/api migrate:distributors               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:distributors -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const distributors = mongoose.connection.db!.collection('distributors');

  let seen = 0;
  let changed = 0;
  for await (const doc of distributors.find({})) {
    seen++;
    const patch = planDistributor(doc);
    if (!patch) continue;
    changed++;
    logger.info({ id: String(doc['_id']), name: doc['name'], set: patch.set, unset: patch.unset }, apply ? 'migrating' : 'would migrate');
    if (apply) {
      await distributors.updateOne(
        { _id: doc['_id'] },
        { ...(Object.keys(patch.set).length > 0 && { $set: patch.set }), ...(patch.unset.length > 0 && { $unset: Object.fromEntries(patch.unset.map((f) => [f, ''])) }) },
      );
    }
  }
  if (apply) {
    // The old single-route and assigned-MR indexes are replaced by the multikey ones the model creates; drop them if they are still there.
    for (const name of ['routeId_1_status_1', 'assignedMrId_1']) await distributors.dropIndex(name).catch(() => undefined);
  }
  logger.info({ distributors: seen, changed }, apply ? 'done' : 'dry run — nothing was written. Run again with --apply to write.');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
