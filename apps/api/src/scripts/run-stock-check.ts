import mongoose from 'mongoose';
import { buildContainers } from '@/container.js';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * The month-end stock check (docs/LLD/sales-and-orders.md, *Monthly stock*). The application has no scheduler; the
 * operator's cron runs this on the 1st (or the day after any grace period):
 *
 *   pnpm --filter @greynote/api stock-check:run [--month YYYY-MM]   (dev, via tsx)
 *   node dist/scripts/run-stock-check.js [--month YYYY-MM]          (prod, inside the container)
 *
 * It only reads: it lists, per MR, the outlets with no count for the month (default: the month that just ended) and
 * changes nothing, so it is safe to run any number of times. Delivery to managers waits for the notifications rules (F8).
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--month');
  const month = at >= 0 ? args[at + 1] : undefined;
  if (at >= 0 && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw new Error('--month must be YYYY-MM');

  await mongoose.connect(env.MONGO_URI);
  try {
    const { sales } = buildContainers();
    const run = await sales.runStockCheck(month);
    logger.info({ month: run.month, mrsMissing: run.missing.length, outletsMissing: run.missing.reduce((n, r) => n + r.outlets.length, 0) }, 'monthly stock check finished');
    for (const row of run.missing) logger.info({ userId: row.userId, name: row.userName, outlets: row.outlets.map((o) => `${o.type}:${o.name}`) }, 'stock counts missing');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'monthly stock check failed');
  process.exit(1);
});
