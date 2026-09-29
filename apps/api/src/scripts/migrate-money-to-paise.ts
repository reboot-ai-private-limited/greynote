import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { rupeesToPaise } from '@/shared/money/paise.js';

/**
 * One-off, idempotent: money stored as `Decimal128` rupees becomes whole paise under a new name
 * (docs/engineering/coding-standards.md, *Money*; decision-log 2026-09-29).
 *
 *   PayBand: baseSalary, taPerKmRate, hqDa, exStationDa, outStationDa  →  …Paise
 *   Route:   taPerKmRateOverride                                       →  taPerKmRateOverridePaise
 *
 * Run it BEFORE starting the version that reads the new names, in every environment:
 *
 *   pnpm --filter @greynote/api migrate:money                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:money -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:money -- --apply --backup ./money-backup.json
 *
 * (Built: `node dist/scripts/migrate-money-to-paise.js [--apply] [--backup file]`.) Safe to repeat:
 * a document already converted is skipped, and one that can't be converted exactly (a value with more
 * than 2 decimal places, or a negative one) stops the whole run before anything is written.
 */

const PAY_BAND_FIELDS: Array<[string, string]> = [
  ['baseSalary', 'baseSalaryPaise'],
  ['taPerKmRate', 'taPerKmRatePaise'],
  ['hqDa', 'hqDaPaise'],
  ['exStationDa', 'exStationDaPaise'],
  ['outStationDa', 'outStationDaPaise'],
];

interface Change {
  collection: string;
  id: unknown;
  before: Record<string, unknown>;
  $set: Record<string, number | null>;
  $unset: Record<string, ''>;
}

const asRupees = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./money-migration-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'money migration');

  const changes: Change[] = [];
  const problems: string[] = [];

  for (const doc of await db.collection('paybands').find().toArray()) {
    const $set: Change['$set'] = {};
    const $unset: Change['$unset'] = {};
    for (const [oldName, newName] of PAY_BAND_FIELDS) {
      if (!(oldName in doc)) continue;
      const paise = rupeesToPaise(asRupees(doc[oldName]) ?? '');
      if (paise === null) problems.push(`PayBand ${doc['name']} (${doc._id}): ${oldName} = ${String(doc[oldName])} isn't a rupee amount with at most 2 decimals`);
      else $set[newName] = paise;
      $unset[oldName] = '';
    }
    if (Object.keys($unset).length > 0) changes.push({ collection: 'paybands', id: doc._id, before: doc, $set, $unset });
  }

  for (const doc of await db.collection('routes').find({ taPerKmRateOverride: { $exists: true } }).toArray()) {
    const rupees = asRupees(doc['taPerKmRateOverride']);
    const $set: Change['$set'] = {};
    if (rupees === null) $set['taPerKmRateOverridePaise'] = null;
    else {
      const paise = rupeesToPaise(rupees);
      if (paise === null) problems.push(`Route ${doc['name']} (${doc._id}): taPerKmRateOverride = ${rupees} isn't a rupee amount with at most 2 decimals`);
      else $set['taPerKmRateOverridePaise'] = paise;
    }
    changes.push({ collection: 'routes', id: doc._id, before: doc, $set, $unset: { taPerKmRateOverride: '' } });
  }

  for (const c of changes) logger.info({ collection: c.collection, id: String(c.id), set: c.$set, unset: Object.keys(c.$unset) }, 'to convert');
  if (problems.length > 0) {
    for (const p of problems) logger.error(p);
    throw new Error(`${problems.length} value(s) can't be converted exactly — nothing was written. Fix them and run again.`);
  }
  if (changes.length === 0) {
    logger.info('nothing to convert — already migrated');
    return;
  }
  if (!apply) {
    logger.info({ documents: changes.length }, 'dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(changes.map((c) => ({ collection: c.collection, id: c.id, before: c.before })), null, 2));
  logger.info({ backupPath }, 'backup written');
  for (const c of changes) {
    await db.collection(c.collection).updateOne({ _id: c.id as never }, { $set: c.$set, $unset: c.$unset });
  }

  // Verify: no old field is left, every new one is a whole number of paise (or a null override).
  const leftovers =
    (await db.collection('paybands').countDocuments({ $or: PAY_BAND_FIELDS.map(([o]) => ({ [o]: { $exists: true } })) })) +
    (await db.collection('routes').countDocuments({ taPerKmRateOverride: { $exists: true } }));
  const bad = await db.collection('paybands').countDocuments({ $or: PAY_BAND_FIELDS.map(([, n]) => ({ [n]: { $not: { $type: ['int', 'long', 'double'] } } })) });
  if (leftovers > 0 || bad > 0) throw new Error(`verification failed: ${leftovers} old field(s) left, ${bad} pay band(s) with a non-numeric new field`);
  logger.info({ documents: changes.length }, 'money converted to paise and verified');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'money migration failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
