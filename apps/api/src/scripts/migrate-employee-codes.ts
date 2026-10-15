import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planEmployeeCodes } from './employeeCodeMigration.js';

/**
 * One-off, idempotent: every employee (office staff and field alike) moves to the GHC001, GHC002 … codes, oldest joiner first
 * (decision-log 2026-10-15). Anyone already on a GHC code keeps it. Demo accounts are left out (remove them with
 * `seed:demo-manager -- --remove` first). The code is stored on the user only, so nothing else is rewritten, and the counter is set
 * to the last number used so the next new employee continues from there. EVERYONE MUST SIGN IN WITH THE NEW CODE: the old to new
 * list is printed so people can be told.
 *
 *   pnpm --filter @greynote/api migrate:employee-codes               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:employee-codes -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const users = db.collection('users');
  const profiles = db.collection('employeeprofiles');

  const joined = new Map<string, Date | null>();
  for (const p of await profiles.find({}, { projection: { userId: 1, dateOfJoining: 1 } }).toArray()) {
    joined.set(String(p['userId']), (p['dateOfJoining'] as Date | null) ?? null);
  }
  const docs = await users.find({ isDemo: { $ne: true } }, { projection: { employeeCode: 1, createdAt: 1 } }).toArray();
  const plan = planEmployeeCodes(
    docs.map((u) => ({
      id: String(u._id),
      employeeCode: String(u['employeeCode']),
      dateOfJoining: joined.get(String(u._id)) ?? null,
      createdAt: (u['createdAt'] as Date | undefined) ?? null,
    })),
  );

  logger.info({ users: docs.length, toRename: plan.changes.length, lastSequence: plan.lastSequence }, apply ? 'applying' : 'dry run — nothing is written');
  console.log('old code,new code');
  for (const c of plan.changes) console.log(`${c.from},${c.to}`);

  if (apply) {
    for (const c of plan.changes) await users.updateOne({ _id: new mongoose.Types.ObjectId(c.id) }, { $set: { employeeCode: c.to } });
    if (plan.changes.length > 0) {
      await db.collection<{ _id: string; seq: number }>('counters').updateOne({ _id: 'employeeCode' }, { $max: { seq: plan.lastSequence } }, { upsert: true });
    }
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
