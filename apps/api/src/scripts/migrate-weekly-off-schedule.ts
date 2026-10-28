import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planWeeklyOffSchedule } from './weeklyOffScheduleMigration.js';

/**
 * One-off, idempotent: the weekly off moved from the single setting `WEEKLY_OFF_DAY` to the schedule `WEEKLY_OFF_SCHEDULE` (decision-log
 * 2026-10-28). Re-run the seed first so the new setting exists, then this carries a company's old weekday over; one that was Sunday needs nothing.
 *
 *   pnpm --filter @greynote/api migrate:weekly-off-schedule             dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:weekly-off-schedule -- --apply  writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const configs = mongoose.connection.db!.collection('systemconfigs');
  const old = await configs.findOne<{ value: string }>({ key: 'WEEKLY_OFF_DAY' });
  const current = await configs.findOne<{ value: string }>({ key: 'WEEKLY_OFF_SCHEDULE' });
  const plan = planWeeklyOffSchedule(old?.value ?? null, current?.value ?? null);
  logger.info({ plan }, apply ? 'applying' : 'dry run — nothing is written');
  if (apply && plan.action === 'replace') {
    await configs.updateOne({ key: 'WEEKLY_OFF_SCHEDULE' }, { $set: { value: plan.value, updatedAt: new Date() } });
    logger.info('done');
  } else if (!apply && plan.action === 'replace') {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
