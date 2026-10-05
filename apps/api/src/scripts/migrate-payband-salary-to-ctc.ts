import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: `PayBand.baseSalaryPaise` goes away, since salary is now a per-employee CTC (decision-log 2026-10-05).
 *
 *   PayBand: baseSalaryPaise (a monthly salary) → suggestedCtcAnnualPaise = baseSalaryPaise × 12, only where none is set
 *            yet, then baseSalaryPaise is removed. It is only a suggestion that pre-fills the CTC box.
 *
 * It does NOT give any employee a CTC. Until HR assigns one, payroll skips that employee with `NO_CTC`; payroll runs already
 * generated keep their figures. Run it BEFORE starting the version that no longer reads `baseSalaryPaise`:
 *
 *   pnpm --filter @greynote/api migrate:payband-ctc                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:payband-ctc -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:payband-ctc -- --apply --backup ./payband-backup.json
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./payband-ctc-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'pay band → CTC migration');

  const bands = await db.collection('paybands').find({ baseSalaryPaise: { $exists: true } }).toArray();
  if (bands.length === 0) {
    logger.info('nothing to convert — already migrated');
    return;
  }

  const plan = bands.map((b) => {
    const base = b.baseSalaryPaise as number;
    const suggested = b.suggestedCtcAnnualPaise ?? base * 12;
    return { id: b._id, name: b.name as string, baseSalaryPaise: base, suggestedCtcAnnualPaise: suggested };
  });
  const bad = plan.filter((p) => !Number.isSafeInteger(p.suggestedCtcAnnualPaise) || p.suggestedCtcAnnualPaise < 0);
  if (bad.length > 0) throw new Error(`Pay band(s) ${bad.map((b) => b.name).join(', ')} have a salary that can't be turned into a CTC — nothing was written.`);

  for (const p of plan) logger.info({ grade: p.name, monthlySalary: p.baseSalaryPaise, suggestedCtcAnnual: p.suggestedCtcAnnualPaise }, 'pay band');
  if (!apply) {
    logger.info({ payBands: plan.length }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(bands, null, 2));
  logger.info({ backupPath }, 'backup written');
  for (const p of plan) {
    await db.collection('paybands').updateOne({ _id: p.id }, { $set: { suggestedCtcAnnualPaise: p.suggestedCtcAnnualPaise }, $unset: { baseSalaryPaise: '' } });
  }
  const left = await db.collection('paybands').countDocuments({ baseSalaryPaise: { $exists: true } });
  if (left > 0) throw new Error(`verification failed: ${left} pay band(s) still have baseSalaryPaise.`);
  logger.info({ payBands: plan.length }, 'pay bands converted and verified');
}

main()
  .catch((err) => {
    logger.error({ err }, 'pay band → CTC migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
