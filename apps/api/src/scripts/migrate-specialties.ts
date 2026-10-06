import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { keyOf, planSpecialties } from './specialtyMigration.js';

/**
 * One-off, idempotent: a doctor's speciality is now chosen from an Admin-kept list (decision-log 2026-10-06). This builds that list
 * from a starter set of common specialities plus every speciality the existing doctors carry (merged ignoring case and spacing),
 * and respells the doctors whose text differs from the list's only in case or spacing. A doctor's speciality is never changed to
 * a different one, and a doctor's old `category` is left in the database but no longer read.
 *
 *   pnpm --filter @greynote/api migrate:specialties               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:specialties -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const doctors = db.collection('doctors');
  const specialties = db.collection('specialties');

  const stored = (await doctors.find({}, { projection: { specialty: 1 } }).toArray()).map((d) => String(d['specialty'] ?? ''));
  const plan = planSpecialties(stored);
  const existing = new Set((await specialties.find({}, { projection: { nameKey: 1 } }).toArray()).map((s) => String(s['nameKey'])));
  const toAdd = plan.specialties.filter((name) => !existing.has(keyOf(name)));

  logger.info({ doctors: stored.length, listed: plan.specialties.length, toAdd: toAdd.length, toRespell: plan.respell.length }, apply ? 'applying' : 'dry run — nothing is written');
  for (const r of plan.respell) logger.info({ from: r.from, to: r.to }, 'respell');

  if (apply) {
    for (const name of toAdd) await specialties.updateOne({ nameKey: keyOf(name) }, { $setOnInsert: { name, nameKey: keyOf(name), status: 'active' } }, { upsert: true });
    await specialties.createIndex({ nameKey: 1 }, { unique: true });
    for (const r of plan.respell) await doctors.updateMany({ specialty: r.from }, { $set: { specialty: r.to } });
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
