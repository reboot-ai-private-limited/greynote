import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: an expense is payable only once its month is finalized by the Accountant (decision-log 2026-10-13). Months before the
 * cutover month were approved and paid under the old rule, so they keep being payable: every expense dated before `--before YYYY-MM` that is
 * `monthApproved` and not yet `monthFinalized` gets `monthFinalized = true`, and every month record before it that is not finalized gets
 * `finalizedAt` (its submit time, or now) so the review shows it as finalized. Months from the cutover on are finalized in the portal.
 *
 *   pnpm --filter @greynote/api migrate:expense-finalized -- --before 2026-10            dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:expense-finalized -- --before 2026-10 --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const at = process.argv.indexOf('--before');
  const before = at >= 0 ? process.argv[at + 1] : undefined;
  if (!before || !/^\d{4}-(0[1-9]|1[0-2])$/.test(before)) throw new Error('Pass the cutover month: --before YYYY-MM');
  await mongoose.connect(env.MONGO_URI);
  const expenses = mongoose.connection.db!.collection('expenses');
  const months = mongoose.connection.db!.collection('expensemonths');
  const rowFilter = { monthApproved: true, monthFinalized: { $ne: true }, reportDate: { $lt: `${before}-01` } };
  // The employee-months that have (or will have) finalized rows: those are the approved ones.
  const approvedMonths = async () =>
    expenses
      .aggregate<{ _id: { userId: unknown; month: string } }>([
        { $match: { monthApproved: true, reportDate: { $lt: `${before}-01` } } },
        { $group: { _id: { userId: '$userId', month: { $substrBytes: ['$reportDate', 0, 7] } } } },
      ])
      .toArray();
  const pairs = await approvedMonths();
  const recordFilter = (p: { _id: { userId: unknown; month: string } }) => ({ userId: p._id.userId, month: p._id.month, finalizedAt: null });
  let recordsToFinalize = 0;
  for (const p of pairs) recordsToFinalize += await months.countDocuments(recordFilter(p));
  logger.info({ rowsToFinalize: await expenses.countDocuments(rowFilter), monthRecordsToFinalize: recordsToFinalize, before }, apply ? 'applying' : 'dry run — nothing is written');
  if (apply) {
    const rows = await expenses.updateMany(rowFilter, { $set: { monthFinalized: true } });
    let records = 0;
    for (const p of pairs) records += (await months.updateMany(recordFilter(p), [{ $set: { finalizedAt: { $ifNull: ['$submittedAt', '$$NOW'] } } }])).modifiedCount;
    logger.info({ rows: rows.modifiedCount, monthRecords: records }, 'done');
  } else {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
