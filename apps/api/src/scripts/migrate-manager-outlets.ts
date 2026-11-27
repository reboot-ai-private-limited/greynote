import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * Report only (decision-log 2026-11-27): with `MANAGERS_CAN_HOLD_OUTLETS` off, managers (any designation above MR) no longer take new
 * doctors or chemists. This lists the managers who hold some today, with counts, so Admin can move them to MRs from the employee page's
 * Assigned section. It changes nothing.
 *
 *   pnpm --filter @greynote/api migrate:manager-outlets
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const levelOf = new Map((await db.collection('designations').find({}, { projection: { level: 1 } }).toArray()).map((d) => [String(d._id), Number(d.level)]));
  const profiles = await db.collection('employeeprofiles').find({}, { projection: { userId: 1, designationId: 1 } }).toArray();
  const managers = new Set(profiles.filter((p) => (levelOf.get(String(p.designationId)) ?? 1) > 1).map((p) => String(p.userId)));

  const count = async (collection: string) => {
    const rows = await db.collection(collection).aggregate<{ _id: unknown; n: number }>([{ $match: { status: 'active' } }, { $group: { _id: '$userId', n: { $sum: 1 } } }]).toArray();
    return new Map(rows.filter((r) => managers.has(String(r._id))).map((r) => [String(r._id), r.n]));
  };
  const [doctors, chemists] = await Promise.all([count('doctorassignments'), count('chemistassignments')]);
  const ids = [...new Set([...doctors.keys(), ...chemists.keys()])];
  const users = await db.collection('users').find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } }, { projection: { name: 1, employeeCode: 1 } }).toArray();
  const rows = users.map((u) => ({ employee: `${String(u.employeeCode)} ${String(u.name)}`, doctors: doctors.get(String(u._id)) ?? 0, chemists: chemists.get(String(u._id)) ?? 0 }));
  if (rows.length === 0) logger.info('no manager holds doctors or chemists');
  else logger.info({ managers: rows.length, rows }, 'managers who hold doctors or chemists — move them to MRs from each employee’s Assigned section');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'manager outlets report failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
