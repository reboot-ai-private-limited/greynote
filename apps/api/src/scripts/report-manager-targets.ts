import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * Read-only: a manager's target is now the total of the MRs in their team (decision-log 2026-10-14), so a target set directly on a
 * manager (any designation above MR) is no longer read. Lists them so Admin can see what stopped counting. Nothing is changed or deleted.
 *
 *   pnpm --filter @greynote/api report:manager-targets
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const managerDesignations = (await db.collection('designations').find({ name: { $ne: 'MR' } }).toArray()).map((d) => d._id);
  const profiles = await db.collection('employeeprofiles').find({ designationId: { $in: managerDesignations } }, { projection: { userId: 1, designationId: 1 } }).toArray();
  const designationName = new Map((await db.collection('designations').find().toArray()).map((d) => [String(d._id), String(d.name)]));
  const byUser = new Map(profiles.map((p) => [String(p.userId), designationName.get(String(p.designationId)) ?? '?']));
  const targets = await db.collection('targets').find({ userId: { $in: profiles.map((p) => p.userId) } }).sort({ userId: 1, month: 1 }).toArray();
  const users = new Map((await db.collection('users').find({ _id: { $in: [...new Set(targets.map((t) => t.userId))] } }).toArray()).map((u) => [String(u._id), `${u.employeeCode} ${u.name}`]));

  logger.info({ managerTargets: targets.length }, 'targets set directly on managers (ignored from now on)');
  for (const t of targets) {
    logger.info(
      { who: users.get(String(t.userId)) ?? String(t.userId), designation: byUser.get(String(t.userId)), from: t.month, to: t.toMonth ?? t.month, productId: t.productId ? String(t.productId) : 'all products', amountPaise: t.targetAmountPaise },
      'ignored target',
    );
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'report failed');
  process.exit(1);
});
