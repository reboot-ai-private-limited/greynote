import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planEqualSplit } from './splitAllProductTargets.js';

/**
 * One-off, idempotent (decision-log 2026-11-20): every target is now for a product, so each old "all products" target of the financial year is
 * divided equally across the active products that have a PTS, in whole paise that add up to it, and removed. Targets of past financial years,
 * campaign targets, and anyone who is not an active MR are left alone. A product the person already has a target for over exactly the same
 * months gets the share added to it. Run it once the API that refuses all-products targets is deployed.
 *
 *   pnpm --filter @greynote/api migrate:split-targets                       dry run: changes nothing, lists what would happen
 *   pnpm --filter @greynote/api migrate:split-targets -- --apply            writes
 *   add  --year=2026  for the financial year starting in 2026 (default: the one that holds today; the year starts in April)
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const yearArg = process.argv.find((a) => a.startsWith('--year='))?.slice('--year='.length);
  const now = new Date(Date.now() + 5.5 * 3_600_000);
  const year = yearArg ? Number(yearArg) : now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const from = `${year}-04`;
  const to = `${year + 1}-03`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const targets = db.collection('targets');
  const legacyDocs = await targets.find({ productId: null, campaignId: null, month: { $gte: from, $lte: to }, toMonth: { $lte: to } }).toArray();
  const productDocs = await db.collection('products').find({ status: 'active', ptsPaise: { $gt: 0 } }, { projection: { _id: 1, ptsPaise: 1, name: 1 } }).toArray();

  // Who cannot hold a target: not an active FIELD user, or a manager (any designation above MR; their targets are not read).
  const userIds = [...new Set(legacyDocs.map((t) => String(t.userId)))].map((id) => new mongoose.Types.ObjectId(id));
  const users = await db.collection('users').find({ _id: { $in: userIds } }, { projection: { status: 1, roleId: 1, name: 1, employeeCode: 1 } }).toArray();
  const fieldRoleId = String((await db.collection('roles').findOne({ name: 'FIELD' }))?._id);
  const designations = new Map((await db.collection('designations').find().toArray()).map((d) => [String(d._id), String(d.name)]));
  const profiles = await db.collection('employeeprofiles').find({ userId: { $in: userIds } }, { projection: { userId: 1, designationId: 1 } }).toArray();
  const isManager = new Set(profiles.filter((p) => (designations.get(String(p.designationId)) ?? 'MR') !== 'MR').map((p) => String(p.userId)));
  const skipUsers = new Set(users.filter((u) => u.status !== 'active' || String(u.roleId) !== fieldRoleId || isManager.has(String(u._id))).map((u) => String(u._id)));
  for (const id of userIds.map(String)) if (!users.some((u) => String(u._id) === id)) skipUsers.add(id);
  const label = new Map(users.map((u) => [String(u._id), `${u.employeeCode ?? ''} ${u.name ?? ''}`.trim()]));

  const existingDocs = await targets
    .find({ userId: { $in: userIds }, productId: { $ne: null }, campaignId: null, month: { $gte: from }, toMonth: { $lte: to } })
    .toArray();
  const plan = planEqualSplit({
    legacy: legacyDocs.map((t) => ({ id: String(t._id), userId: String(t.userId), month: t.month as string, toMonth: (t.toMonth ?? t.month) as string, amountPaise: t.targetAmountPaise as number, createdBy: String(t.createdBy) })),
    products: productDocs.map((p) => ({ id: String(p._id), ptsPaise: p.ptsPaise as number })),
    existing: existingDocs.map((t) => ({ id: String(t._id), userId: String(t.userId), month: t.month as string, toMonth: (t.toMonth ?? t.month) as string, productId: String(t.productId), amountPaise: t.targetAmountPaise as number })),
    skipUsers,
  });

  logger.info({ financialYear: `${year}-${String(year + 1).slice(2)}`, oldTargets: legacyDocs.length, products: productDocs.length, toCreate: plan.inserts.length, toAddTo: plan.adds.length, toRemove: plan.removeIds.length, skipped: plan.skipped.length }, apply ? 'applying' : 'dry run: nothing is written');
  for (const t of legacyDocs.filter((d) => plan.removeIds.includes(String(d._id)))) {
    logger.info({ who: label.get(String(t.userId)) ?? String(t.userId), from: t.month, to: t.toMonth ?? t.month, amountPaise: t.targetAmountPaise, eachPaise: Math.floor((t.targetAmountPaise as number) / Math.max(1, productDocs.length)) }, 'will split');
  }
  for (const s of plan.skipped) {
    const t = legacyDocs.find((d) => String(d._id) === s.id);
    logger.info({ who: label.get(String(t?.userId)) ?? String(t?.userId), reason: s.reason }, 'left as it is');
  }

  if (apply) {
    const at = new Date();
    if (plan.inserts.length > 0) {
      await targets.insertMany(
        plan.inserts.map((i) => ({ userId: new mongoose.Types.ObjectId(i.userId), month: i.month, toMonth: i.toMonth, productId: new mongoose.Types.ObjectId(i.productId), campaignId: null, targetAmountPaise: i.amountPaise, targetQty: i.qty, createdBy: new mongoose.Types.ObjectId(i.createdBy), createdAt: at, updatedAt: at })),
      );
    }
    for (const a of plan.adds) await targets.updateOne({ _id: new mongoose.Types.ObjectId(a.id) }, { $set: { targetAmountPaise: a.amountPaise, targetQty: a.qty, updatedAt: at } });
    // The old targets go last, so a failure above leaves an extra amount (rerun-safe), never a smaller total.
    if (plan.removeIds.length > 0) await targets.deleteMany({ _id: { $in: plan.removeIds.map((id) => new mongoose.Types.ObjectId(id)) } });
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
