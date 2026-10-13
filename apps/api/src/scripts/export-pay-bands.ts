import { mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { PayBandModel } from '@/modules/identity/infrastructure/payBand.schema.js';
import { parsePayBands } from './productionSeed.js';

/**
 * Read-only: writes the current pay bands (grades) to `prod-seed/payBands.json`, to be reviewed by hand and then used
 * by `seed-production`. Only the name and the four rates are written — no personal data.
 *
 *   pnpm --filter @greynote/api export:pay-bands
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    const rows = await PayBandModel.find({}).sort({ name: 1 }).lean();
    const bands = parsePayBands(
      rows.map((r) => ({
        name: r.name,
        taPerKmRatePaise: r.taPerKmRatePaise,
        hqDaPaise: r.hqDaPaise,
        exStationDaPaise: r.exStationDaPaise,
        outStationDaPaise: r.outStationDaPaise,
      })),
    );
    await mkdir('prod-seed', { recursive: true });
    await writeFile('prod-seed/payBands.json', `${JSON.stringify(bands, null, 2)}\n`);
    logger.info({ count: bands.length, names: bands.map((b) => b.name) }, 'wrote prod-seed/payBands.json — review it before use');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.error({ err: String(err) }, 'export-pay-bands failed');
  process.exitCode = 1;
});
