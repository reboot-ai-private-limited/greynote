import mongoose from 'mongoose';
import { buildContainers } from '@/container.js';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * The missed-DCR compliance job (docs/hld/10, docs/LLD/field-activity.md, *The missed-DCR job*). The application has
 * no scheduler; the operator's cron runs this once a day, after the day rolls over:
 *
 *   pnpm --filter @greynote/api compliance:run [--dry-run] [--user <id> ...]   (dev, via tsx)
 *   node dist/scripts/run-compliance.js [--dry-run] [--user <id> ...]          (prod, inside the container)
 *
 * It is safe to run twice, or again after a failure. `--dry-run` reports who would be blocked and blocks no one;
 * `--user` limits the run to those employees. It exits 1 if any employee could not be checked, so cron can alert.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const userIds: string[] = [];
  for (let i = 0; i < args.length; i += 1) if (args[i] === '--user' && args[i + 1]) userIds.push(args[(i += 1)]!);
  const dryRun = args.includes('--dry-run');

  await mongoose.connect(env.MONGO_URI);
  try {
    const { fieldActivity } = buildContainers();
    const run = await fieldActivity.runMissedDcrCheck({ dryRun, ...(userIds.length > 0 && { userIds }) });
    logger.info(
      { through: run.through, enabled: run.enabled, dryRun: run.dryRun, graceDays: run.graceDays, checked: run.checked, blocked: run.blocked, alreadyBlocked: run.alreadyBlocked, failed: run.failed },
      run.enabled ? 'missed-DCR check finished' : 'missed-DCR check skipped: DCR_MISS_BLOCK_ENABLED is false',
    );
    if (run.failed.length > 0) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'missed-DCR check failed');
  process.exit(1);
});
