import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { phoneKey } from '@/modules/field-master-data/domain/phone.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * Read-only report for cleaning up Doctors and Chemists saved before a phone number (and, for Doctors, a visit frequency) became required and unique:
 * who has no phone, who has no visit frequency, and which phone numbers are shared (the same number in any spelling counts). Changes nothing.
 *
 *   pnpm --filter @greynote/api report:phone-gaps
 */
type Row = { _id: unknown; name: string; phone?: string | null; visitFrequency?: number | null; status: string };

async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  for (const [collection, withFrequency] of [['doctors', true], ['chemists', false]] as const) {
    const rows = await db.collection<Row>(collection).find({ status: { $in: ['pending', 'active'] } }, { projection: { name: 1, phone: 1, visitFrequency: 1, status: 1 } }).toArray();
    const byKey = new Map<string, Row[]>();
    for (const r of rows) if (r.phone) byKey.set(phoneKey(r.phone), [...(byKey.get(phoneKey(r.phone)) ?? []), r]);
    const shared = [...byKey.entries()].filter(([, v]) => v.length > 1);
    logger.info(
      {
        total: rows.length,
        noPhone: rows.filter((r) => !r.phone).length,
        ...(withFrequency && { noFrequency: rows.filter((r) => !r.visitFrequency).length }),
        sharedNumbers: shared.length,
      },
      `${collection}: pending and active`,
    );
    for (const [key, v] of shared) logger.info({ number: key, records: v.map((r) => `${r.name} (${String(r._id)}, ${r.status})`) }, `${collection}: shared phone`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'report failed');
  process.exit(1);
});
