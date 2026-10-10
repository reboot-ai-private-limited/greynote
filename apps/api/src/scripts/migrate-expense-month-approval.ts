import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: an expense is payable only once its month statement is approved (decision-log 2026-10-10). Rows from before the cutover
 * month were accepted under the old rule, so they keep being payable: every row dated before `--before YYYY-MM` that has no
 * `monthApproved` yet gets `monthApproved = true`. Rows from the cutover month on go through the statement.
 *
 *   pnpm --filter @greynote/api migrate:expense-months -- --before 2026-10            dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:expense-months -- --before 2026-10 --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const at = process.argv.indexOf('--before');
  const before = at >= 0 ? process.argv[at + 1] : undefined;
  if (!before || !/^\d{4}-(0[1-9]|1[0-2])$/.test(before)) throw new Error('Pass the cutover month: --before YYYY-MM');
  await mongoose.connect(env.MONGO_URI);
  const expenses = mongoose.connection.db!.collection('expenses');

  const filter = { monthApproved: { $ne: true }, reportDate: { $lt: `${before}-01` } };
  logger.info({ rowsToGrandfather: await expenses.countDocuments(filter), before }, apply ? 'applying' : 'dry run — nothing is written');
  if (apply) {
    const res = await expenses.updateMany(filter, { $set: { monthApproved: true } });
    logger.info({ modified: res.modifiedCount }, 'done');
  } else {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
