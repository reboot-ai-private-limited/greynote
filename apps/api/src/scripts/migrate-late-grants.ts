import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: late-submission exceptions for plans now live in the unified `lategrants` collection (alongside expenses and stock,
 * with one set of rules). Copies every `latesubmitgrants` row across, `planKey` becoming `periodKey`. A row already copied (same employee,
 * kind, period and grant time) is left alone, as is an old OPEN row for a plan that already has an OPEN grant in the new collection.
 *
 *   pnpm --filter @greynote/api migrate:late-grants            dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:late-grants -- --apply writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const from = db.collection('latesubmitgrants');
  const to = db.collection('lategrants');
  let seen = 0;
  let copied = 0;
  let already = 0;
  let clashed = 0;
  for await (const old of from.find({})) {
    seen += 1;
    const key = { userId: old['userId'], kind: old['kind'], periodKey: old['planKey'], grantedAt: old['grantedAt'] };
    if (await to.countDocuments(key, { limit: 1 })) {
      already += 1;
      continue;
    }
    if (!apply) {
      copied += 1;
      continue;
    }
    const { _id, planKey, ...rest } = old;
    void _id;
    try {
      await to.insertOne({ ...rest, periodKey: planKey, usedRef: null });
      copied += 1;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      clashed += 1;
    }
  }
  logger.info({ seen, [apply ? 'copied' : 'wouldCopy']: copied, already, clashed }, apply ? 'done' : 'dry run — nothing is written');
  if (!apply) logger.info('Run again with --apply to write.');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
