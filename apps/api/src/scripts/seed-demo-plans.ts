import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { removeDemoPlans, seedDemoPlans } from './demoPlans.js';

/**
 * December 2026 Tour Plans for the demo accounts (what they hold: see `demoPlans.ts`).
 *
 *   pnpm --filter @greynote/api seed:demo-plans              create
 *   pnpm --filter @greynote/api seed:demo-plans -- --remove  delete them again
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    if (process.argv.includes('--remove')) return await removeDemoPlans();
    await seedDemoPlans();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-demo-plans failed');
  process.exitCode = 1;
});
