import mongoose from 'mongoose';
import { MAX_VISIT_FREQUENCY } from '@greynote/contracts';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/** The setting retired on 2026-10-22: never read by anything; to be added again when coverage reporting needs it. */
const RETIRED_SETTING = 'NEW_DOCTOR_COVERAGE_WAIT_DAYS';

/**
 * One-off, idempotent (decision-log 2026-10-22): a doctor's visit frequency is now at most 4 a month, so doctors saved with more are set
 * to 4; and the unused "New doctor coverage wait" setting is deleted (a stored setting without a definition is ignored anyway, this only
 * tidies it away). `DOCTOR_VISIT_GAP_DAYS` itself needs nothing here: the seed adds it with its default.
 *
 *   pnpm --filter @greynote/api migrate:doctor-visits               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:doctor-visits -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const doctors = db.collection('doctors');
  const settings = db.collection('systemconfigs');

  const over = await doctors.find({ visitFrequency: { $gt: MAX_VISIT_FREQUENCY } }, { projection: { name: 1, visitFrequency: 1 } }).toArray();
  const retired = await settings.countDocuments({ key: RETIRED_SETTING });
  logger.info({ doctorsOverLimit: over.length, retiredSettingRows: retired }, apply ? 'applying' : 'dry run — nothing is written');
  for (const d of over) logger.info({ doctor: String(d['name']), from: d['visitFrequency'], to: MAX_VISIT_FREQUENCY }, 'visit frequency');

  if (apply) {
    const changed = await doctors.updateMany({ visitFrequency: { $gt: MAX_VISIT_FREQUENCY } }, { $set: { visitFrequency: MAX_VISIT_FREQUENCY } });
    const removed = await settings.deleteMany({ key: RETIRED_SETTING });
    logger.info({ doctorsChanged: changed.modifiedCount, settingRowsRemoved: removed.deletedCount }, 'done');
  } else {
    logger.info('Run again with --apply to write.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
