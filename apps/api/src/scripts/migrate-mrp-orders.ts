import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { planOrder, type OrderDoc, type ProductPrices } from './mrpOrderMigration.js';

/**
 * One-off, idempotent: orders an MR placed at the MRP are repriced at PTS (distributor) or PTR (chemist) — decision-log 2026-10-24.
 *
 *   pnpm --filter @greynote/api migrate:mrp-orders               dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:mrp-orders -- --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  const products = new Map<string, ProductPrices>();
  for await (const p of db.collection('products').find({})) products.set(String(p['_id']), { ptsPaise: p['ptsPaise'] ?? null, ptrPaise: p['ptrPaise'] ?? null, mrpPaise: p['mrpPaise'] ?? null });

  const orders = db.collection('orders');
  let seen = 0;
  let changed = 0;
  for await (const doc of orders.find({ status: { $in: ['PLACED', 'DONE'] } })) {
    seen++;
    const patch = planOrder(doc as unknown as OrderDoc, products);
    if (!patch) continue;
    changed++;
    logger.info({ id: String(doc['_id']), orderDate: doc['orderDate'], changes: patch.changes, totalBefore: patch.totalBefore, totalAfter: patch.totalAfter }, apply ? 'repricing' : 'would reprice');
    if (apply) await orders.updateOne({ _id: doc['_id'] }, { $set: patch.set });
  }
  logger.info({ orders: seen, changed }, apply ? 'done' : 'dry run — nothing was written. Run again with --apply to write.');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
