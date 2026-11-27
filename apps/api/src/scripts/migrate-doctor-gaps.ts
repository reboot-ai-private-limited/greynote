import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * Report only (decision-log 2026-11-27): active doctors missing a detail that is now required — phone, visit frequency (1–4), area or
 * qualification — usually doctors added before those rules. Editing one asks for the missing details. It changes nothing.
 *
 *   pnpm --filter @greynote/api migrate:doctor-gaps
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  const doctors = mongoose.connection.db!.collection('doctors');
  const active = { status: 'active' };
  const blank = (field: string) => ({ ...active, $or: [{ [field]: null }, { [field]: '' }, { [field]: { $exists: false } }] });
  const [total, phone, area, qualification, frequency] = await Promise.all([
    doctors.countDocuments(active),
    doctors.countDocuments(blank('phone')),
    doctors.countDocuments(blank('address')),
    doctors.countDocuments(blank('qualification')),
    doctors.countDocuments({ ...active, $or: [{ visitFrequency: null }, { visitFrequency: { $exists: false } }, { visitFrequency: { $lt: 1 } }, { visitFrequency: { $gt: 4 } }] }),
  ]);
  const examples = await doctors
    .find({ ...active, $or: [{ phone: null }, { phone: '' }, { visitFrequency: null }, { visitFrequency: { $gt: 4 } }, { address: '' }, { qualification: '' }] }, { projection: { name: 1 } })
    .limit(10)
    .toArray();
  logger.info({ activeDoctors: total, missing: { noContactNumber: phone, frequency, area, qualification }, examples: examples.map((d) => String(d.name)) }, 'doctors missing a required detail — fill them in from each doctor’s page');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'doctor gaps report failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
