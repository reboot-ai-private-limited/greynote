import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planDelete } from './deleteOrders.js';

/**
 * One-off: permanently delete orders (test data) by id, and drop any payment allocations that point at them.
 *
 *   pnpm --filter @greynote/api delete:orders -- --mr GHC004 --dates 2026-10-14,2026-10-23   dry run — lists that MR's orders on those dates
 *   pnpm --filter @greynote/api delete:orders -- --ids <id>,<id>,<id>                         dry run — shows what deleting them would touch
 *   pnpm --filter @greynote/api delete:orders -- --ids <id>,<id>,<id> --apply                 deletes
 *
 * Take a dump of `orders` and `distributorpayments` first. Nothing here can be undone.
 */
const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const orders = db.collection('orders');
  const payments = db.collection('distributorpayments');

  const code = arg('mr');
  const dates = arg('dates')?.split(',');
  if (code && dates) {
    const user = await db.collection('users').findOne({ employeeCode: code });
    if (!user) throw new Error(`No employee ${code}`);
    for await (const o of orders.find({ userId: user['_id'], orderDate: { $in: dates } }).sort({ orderDate: 1 })) {
      const d = o['distributorId'] ? await db.collection('distributors').findOne({ _id: o['distributorId'] }) : null;
      logger.info({ id: String(o['_id']), orderDate: o['orderDate'], status: o['status'], distributor: d?.['name'], totalAmountPaise: o['totalAmountPaise'], invoiceNumber: o['invoiceNumber'] ?? null }, 'candidate');
    }
    await mongoose.disconnect();
    return;
  }

  const ids = arg('ids')?.split(',').filter(Boolean);
  if (!ids?.length) throw new Error('Pass --ids <id,id,...> (or --mr and --dates to list candidates).');
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const found = await orders.find({ _id: { $in: objectIds } }).toArray();
  const linked = await payments.find({ 'allocations.orderId': { $in: objectIds } }).toArray();
  const plan = planDelete(ids, found, linked);
  for (const o of found) logger.info({ id: String(o['_id']), orderDate: o['orderDate'], status: o['status'], totalAmountPaise: o['totalAmountPaise'], invoiceNumber: o['invoiceNumber'] ?? null }, apply ? 'deleting' : 'would delete');
  if (plan.missing.length) throw new Error(`Not found, nothing changed: ${plan.missing.join(', ')}`);
  if (plan.allocatedPayments.length) logger.warn({ allocations: plan.allocatedPayments }, 'payments are allocated to these orders; the allocations are removed, the payments stay');

  if (apply) {
    await payments.updateMany({ 'allocations.orderId': { $in: objectIds } }, { $pull: { allocations: { orderId: { $in: objectIds } } } } as never);
    const res = await orders.deleteMany({ _id: { $in: objectIds } });
    logger.info({ deleted: res.deletedCount }, 'done');
  } else {
    logger.info({ orders: found.length }, 'dry run — nothing was written. Run again with --apply to delete.');
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'delete failed');
  process.exit(1);
});
