import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * DEVELOPMENT ONLY. Adds one Placed order for an existing distributor so Mark as Done (with the invoice number), the Invoices page, payment
 * allocation and the printable invoice can be tried by hand. It creates nothing else: the distributor, the products and the field employee are
 * ones already in the database. The order says "DEMO ORDER" in its remarks, so `--remove` finds it again. A demo order that was marked Done keeps
 * its invoice, and payments allocated to it stay on record: `--remove` deletes the order and cancels nothing else, so cancel such payments first.
 *
 *   pnpm --filter @greynote/api seed:demo-order                  dry run — says what it would add
 *   pnpm --filter @greynote/api seed:demo-order -- --apply       adds the order (does nothing if one is already there)
 *   pnpm --filter @greynote/api seed:demo-order -- --remove      deletes the demo order(s)
 */
const TAG = 'DEMO ORDER – delete me';

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') throw new Error('The demo order is for development only; this refuses to run in production.');
  const apply = process.argv.includes('--apply');
  const remove = process.argv.includes('--remove');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: remove ? 'REMOVE' : apply ? 'APPLY' : 'dry run' }, 'demo order');

  const orders = db.collection('orders');
  if (remove) {
    const demo = await orders.find({ remarks: TAG }).toArray();
    const done = demo.filter((o) => o['status'] === 'DONE');
    if (done.length > 0) logger.warn({ orders: done.map((o) => String(o['invoiceNumber'] ?? o['_id'])) }, 'a demo order was marked Done: cancel any payment allocated to it too');
    logger.info({ removed: (await orders.deleteMany({ remarks: TAG })).deletedCount }, 'demo order removed');
    return;
  }
  const already = await orders.countDocuments({ remarks: TAG });
  if (already > 0) {
    logger.info({ already }, 'a demo order is already there — run with --remove first to start again');
    return;
  }

  const distributor = await db.collection('distributors').findOne({ status: 'active' }, { sort: { name: 1 } });
  if (!distributor) throw new Error('There is no active distributor to put the demo order on. Create one in the portal first.');
  const products = await db.collection('products').find({ status: 'active', ptsPaise: { $gt: 0 } }).sort({ name: 1 }).limit(2).toArray();
  if (products.length === 0) throw new Error('There is no active product with a PTS price. Create one in the portal first.');
  const fieldRole = await db.collection('roles').findOne({ name: 'FIELD' });
  const assigned = (distributor['assignedUserIds'] as unknown[] | undefined) ?? [];
  const mr = (assigned.length > 0 ? await db.collection('users').findOne({ _id: { $in: assigned } as never }) : null) ?? (await db.collection('users').findOne({ roleId: fieldRole?._id }));
  if (!mr) throw new Error('There is no field employee to credit the demo order to. Create one first.');

  const items = products.map((p, i) => {
    const quantity = 10 * (i + 1);
    const unitPricePaise = Number(p['ptsPaise']);
    const amountPaise = quantity * unitPricePaise;
    return { productId: p['_id'], quantity, unitPricePaise, amountPaise, netAmountPaise: amountPaise, suppliedQty: null, freeQty: 0, discount: null, suppliedNetPaise: null };
  });
  const totalAmountPaise = items.reduce((n, i) => n + i.amountPaise, 0);
  const now = new Date();
  const doc = {
    userId: mr['_id'],
    distributorId: distributor['_id'],
    orderDate: now.toISOString().slice(0, 10),
    status: 'PLACED',
    totalAmountPaise,
    discount: null,
    orderDiscountPaise: 0,
    suppliedAmountPaise: null,
    remarks: TAG,
    items,
    completedBy: null,
    completedAt: null,
    invoiceNumber: null,
    invoice: null,
    clientId: null,
    createdAt: now,
    createdBy: null,
    editedBy: null,
    editedAt: null,
  };
  logger.info({ distributor: distributor['name'], employee: mr['name'] ?? mr['employeeCode'], products: products.map((p) => p['name']), totalRupees: totalAmountPaise / 100 }, apply ? 'writing' : 'dry run — repeat with --apply to write');
  if (!apply) return;
  const { insertedId } = await orders.insertOne(doc as never);
  logger.info({ orderId: String(insertedId) }, 'demo order written (remove with --remove)');
}

main()
  .catch((err) => {
    logger.error({ err }, 'demo order failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
