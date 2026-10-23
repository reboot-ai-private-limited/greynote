import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { DEMO_TEAM_PASSWORD, removeDemoHierarchy, seedDemoHierarchy } from './demoHierarchy.js';

/**
 * The demo ZSM → RSM → ASM / MRs team for the manual approval test (what it is and the territory each person has: see `demoHierarchy.ts`).
 *
 *   pnpm --filter @greynote/api seed:demo-hierarchy              create
 *   pnpm --filter @greynote/api seed:demo-hierarchy -- --remove  delete it again
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    if (process.argv.includes('--remove')) return await removeDemoHierarchy();
    const password = process.env['DEMO_PASSWORD'] ?? DEMO_TEAM_PASSWORD;
    const people = await seedDemoHierarchy(password);
    // eslint-disable-next-line no-console
    console.table(people.map((p) => ({ code: p.code, name: p.name, role: p.designation, reportsTo: p.manager ?? '—', hq: p.hqs.length ? p.hqs.join('+') : 'all in zone', route: p.route ?? 'all in HQ', password })));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'seed-demo-hierarchy failed');
  process.exitCode = 1;
});
