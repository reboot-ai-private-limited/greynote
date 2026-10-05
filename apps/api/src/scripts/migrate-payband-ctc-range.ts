import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: a pay grade now has a required CTC range (decision-log 2026-10-06), and its name is free text with a
 * case-insensitive unique key.
 *
 *   PayBand: nameKey = the name, lower-cased and space-squashed
 *            ctcMinAnnualPaise = ctcMaxAnnualPaise = suggestedCtcAnnualPaise, where one was set; suggestedCtcAnnualPaise removed
 *
 * A grade with no suggested CTC is NOT guessed at: it is listed, and the run stops before anything is written so HR can't be
 * left with a grade nobody can assign to. A min = max range is only a placeholder; the run lists those too, to be widened in
 * the portal. Run it BEFORE starting the version that reads the new fields:
 *
 *   pnpm --filter @greynote/api migrate:payband-range                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:payband-range -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:payband-range -- --apply --backup ./payband-range-backup.json
 */
/** The same rule as `payBandNameKey` in identity's domain (a module's internals are private, so it is repeated here). */
const nameKeyOf = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./payband-range-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'pay grade range migration');

  const bands = await db.collection('paybands').find({ $or: [{ nameKey: { $exists: false } }, { ctcMinAnnualPaise: { $exists: false } }] }).toArray();
  if (bands.length === 0) {
    logger.info('nothing to convert — already migrated');
    return;
  }

  const problems: string[] = [];
  const plan = bands.map((b) => {
    const suggested = b.suggestedCtcAnnualPaise as number | null | undefined;
    const hasRange = typeof b.ctcMinAnnualPaise === 'number' && typeof b.ctcMaxAnnualPaise === 'number';
    if (!hasRange && !(Number.isSafeInteger(suggested) && (suggested ?? 0) > 0)) problems.push(`${String(b.name)} has no suggested CTC to start its range from — set one (or a range) first.`);
    return { id: b._id, name: String(b.name), nameKey: nameKeyOf(String(b.name)), suggested: suggested ?? null, hasRange };
  });
  const keys = new Map<string, string>();
  for (const p of plan) {
    const clash = keys.get(p.nameKey);
    if (clash) problems.push(`${p.name} and ${clash} are the same name ignoring case.`);
    keys.set(p.nameKey, p.name);
  }
  if (problems.length > 0) {
    for (const p of problems) logger.error(p);
    throw new Error(`${problems.length} pay grade(s) can't be converted — nothing was written.`);
  }

  for (const p of plan) logger.info({ grade: p.name, range: p.hasRange ? 'already set' : `${p.suggested} to ${p.suggested} (placeholder — widen it in the portal)` }, 'pay grade');
  if (!apply) {
    logger.info({ payGrades: plan.length }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(bands, null, 2));
  logger.info({ backupPath }, 'backup written');
  for (const p of plan) {
    const $set: Record<string, unknown> = { nameKey: p.nameKey };
    if (!p.hasRange) {
      $set['ctcMinAnnualPaise'] = p.suggested;
      $set['ctcMaxAnnualPaise'] = p.suggested;
    }
    await db.collection('paybands').updateOne({ _id: p.id }, { $set, $unset: { suggestedCtcAnnualPaise: '' } });
  }
  const left = await db.collection('paybands').countDocuments({ $or: [{ nameKey: { $exists: false } }, { ctcMinAnnualPaise: { $exists: false } }] });
  if (left > 0) throw new Error(`verification failed: ${left} pay grade(s) still missing the new fields.`);
  logger.info({ payGrades: plan.length }, 'pay grades converted and verified');
}

main()
  .catch((err) => {
    logger.error({ err }, 'pay grade range migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
