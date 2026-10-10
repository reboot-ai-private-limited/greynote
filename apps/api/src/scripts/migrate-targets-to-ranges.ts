import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

const OLD_INDEX = 'userId_1_month_1_productId_1_campaignId_1';

/**
 * One-off, idempotent: a target now covers a run of months (decision-log 2026-10-10), so every existing monthly target gets `toMonth = month`, and the
 * old one-month unique index is replaced by the range index (which the app creates on start). Nothing else changes; the typed-in monthly
 * achievements stay in their collection as history and are no longer read.
 *
 *   pnpm --filter @greynote/api migrate:targets               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:targets -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const targets = mongoose.connection.db!.collection('targets');

  const missing = await targets.countDocuments({ toMonth: { $exists: false } });
  const indexes = await targets.indexes();
  const hasOld = indexes.some((i) => i.name === OLD_INDEX);
  logger.info({ withoutToMonth: missing, oldIndexPresent: hasOld }, apply ? 'applying' : 'dry run — nothing is written');

  if (apply) {
    await targets.updateMany({ toMonth: { $exists: false } }, [{ $set: { toMonth: '$month' } }]);
    if (hasOld) await targets.dropIndex(OLD_INDEX);
    await targets.createIndex({ userId: 1, month: 1, toMonth: 1, productId: 1, campaignId: 1 }, { unique: true });
    await targets.createIndex({ userId: 1, toMonth: 1 });
    logger.info('done');
  } else {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
