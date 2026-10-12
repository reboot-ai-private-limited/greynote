import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: the in-day "request a change" to an approved Daily Plan is gone (decision-log 2026-10-12). Deletes every
 * `DAILY_PLAN_CHANGE` approval request and the `dailyplanchanges` collection. Plans are untouched — an applied change already
 * lives in the plan's body.
 *
 *   pnpm --filter @greynote/api migrate:drop-plan-changes            dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:drop-plan-changes -- --apply deletes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const requests = db.collection('approvalrequests');
  const changes = db.collection('dailyplanchanges');

  const filter = { kind: 'DAILY_PLAN_CHANGE' };
  logger.info({ approvalRequests: await requests.countDocuments(filter), changes: await changes.countDocuments() }, apply ? 'applying' : 'dry run — nothing is written');
  if (apply) {
    const res = await requests.deleteMany(filter);
    const gone = await changes.deleteMany({});
    logger.info({ approvalRequestsDeleted: res.deletedCount, changesDeleted: gone.deletedCount }, 'done');
  } else {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
