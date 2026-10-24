import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planAdminCodes } from './employeeCodeMigration.js';

/**
 * One-off, idempotent: every Admin user moves to the ADMIN01, ADMIN02 … codes, oldest first. Anyone already on an ADMIN code keeps it. The
 * code is stored on the user only, so nothing else is rewritten, and the Admin counter is set to the last number used so the next new
 * Admin continues from there. THE ADMIN MUST SIGN IN WITH THE NEW CODE: the old to new list is printed.
 *
 *   pnpm --filter @greynote/api migrate:admin-codes               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:admin-codes -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const role = await db.collection('roles').findOne({ name: 'ADMIN' });
  if (!role) throw new Error('No ADMIN role: run the main seed first.');
  const users = db.collection('users');
  const docs = await users.find({ roleId: role['_id'] }, { projection: { employeeCode: 1, createdAt: 1 } }).toArray();
  const plan = planAdminCodes(docs.map((u) => ({ id: String(u._id), employeeCode: String(u['employeeCode']), createdAt: (u['createdAt'] as Date | undefined) ?? null })));

  logger.info({ admins: docs.length, toRename: plan.changes.length, lastSequence: plan.lastSequence }, apply ? 'applying' : 'dry run — nothing is written');
  console.log('old code,new code');
  for (const c of plan.changes) console.log(`${c.from},${c.to}`);

  if (apply) {
    for (const c of plan.changes) await users.updateOne({ _id: new mongoose.Types.ObjectId(c.id) }, { $set: { employeeCode: c.to } });
    if (plan.changes.length > 0) {
      await db.collection<{ _id: string; seq: number }>('counters').updateOne({ _id: 'adminCode' }, { $max: { seq: plan.lastSequence } }, { upsert: true });
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
