import mongoose from 'mongoose';
import { buildContainers } from '@/container.js';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent (decision-log 2026-10-03): Monthly Plans approved BEFORE Daily Plans were inherited get their coming days
 * written as Daily Plans now, exactly as approving them today would. Days already planned are left as they are.
 *
 *   pnpm --filter @greynote/api migrate:inherit-monthly                  dry run — counts, changes nothing
 *   pnpm --filter @greynote/api migrate:inherit-monthly -- --apply       writes
 *
 * Only months from the current one on, and only plans past the manager. Older Daily Plans need nothing: a plan with no `source`
 * reads as MANUAL.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  try {
    const result = await buildContainers().planning.backfillInheritedDays(apply);
    logger.info({ mode: apply ? 'APPLY' : 'dry run', ...result }, 'inherit monthly plans');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'inherit monthly plans failed');
  process.exit(1);
});
