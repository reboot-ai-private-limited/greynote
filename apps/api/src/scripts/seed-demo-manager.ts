import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { removeDemoAccounts, seedDemoAccounts } from './demoAccounts.js';

/**
 * The Google Play reviewer's demo Manager and MRs (what they are and every option: see `demoAccounts.ts`).
 *
 *   DEMO_MANAGER_PASSWORD='…' pnpm --filter @greynote/api seed:demo-manager
 *   DEMO_MANAGER_PASSWORD='…' pnpm --filter @greynote/api seed:demo-manager -- --reset-password
 *   pnpm --filter @greynote/api seed:demo-manager -- --remove
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    if (process.argv.includes('--remove')) return await removeDemoAccounts();
    await seedDemoAccounts(process.env['DEMO_MANAGER_PASSWORD'], { resetPassword: process.argv.includes('--reset-password') });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-demo-manager failed');
  process.exitCode = 1;
});
