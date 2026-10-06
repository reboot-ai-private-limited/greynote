import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: a pay grade's name has a case-insensitive unique key (`nameKey`), and a grade no longer holds a CTC
 * (decision-log 2026-10-06: the CTC is per employee and independent of the grade).
 *
 *   PayBand: nameKey = the name, lower-cased and space-squashed
 *            ctcMinAnnualPaise, ctcMaxAnnualPaise, suggestedCtcAnnualPaise removed
 *
 * An employee's CTC revisions are not touched. Run it BEFORE starting the version that reads the new fields:
 *
 *   pnpm --filter @greynote/api migrate:paybands                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:paybands -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:paybands -- --apply --backup ./paybands-backup.json
 */
/** The same rule as `payBandNameKey` in identity's domain (a module's internals are private, so it is repeated here). */
const nameKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

const OLD_FIELDS = ['ctcMinAnnualPaise', 'ctcMaxAnnualPaise', 'suggestedCtcAnnualPaise'] as const;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./paybands-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'pay grade migration');

  const bands = await db
    .collection('paybands')
    .find({ $or: [{ nameKey: { $exists: false } }, ...OLD_FIELDS.map((f) => ({ [f]: { $exists: true } }))] })
    .toArray();
  if (bands.length === 0) {
    logger.info('nothing to convert — already migrated');
    return;
  }

  const plan = bands.map((b) => ({ id: b._id, name: String(b.name), nameKey: nameKeyOf(String(b.name)) }));
  const keys = new Map<string, string>();
  const problems: string[] = [];
  for (const p of plan) {
    const clash = keys.get(p.nameKey);
    if (clash) problems.push(`${p.name} and ${clash} are the same name ignoring case.`);
    keys.set(p.nameKey, p.name);
  }
  if (problems.length > 0) {
    for (const p of problems) logger.error(p);
    throw new Error(`${problems.length} pay grade(s) can't be converted — nothing was written.`);
  }

  for (const p of plan) logger.info({ grade: p.name }, 'pay grade');
  if (!apply) {
    logger.info({ payGrades: plan.length }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(bands, null, 2));
  logger.info({ backupPath }, 'backup written');
  for (const p of plan) {
    await db.collection('paybands').updateOne({ _id: p.id }, { $set: { nameKey: p.nameKey }, $unset: Object.fromEntries(OLD_FIELDS.map((f) => [f, ''])) });
  }
  const left = await db.collection('paybands').countDocuments({ $or: [{ nameKey: { $exists: false } }, ...OLD_FIELDS.map((f) => ({ [f]: { $exists: true } }))] });
  if (left > 0) throw new Error(`verification failed: ${left} pay grade(s) not converted.`);
  logger.info({ payGrades: plan.length }, 'pay grades converted and verified');
}

main()
  .catch((err) => {
    logger.error({ err }, 'pay grade migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
