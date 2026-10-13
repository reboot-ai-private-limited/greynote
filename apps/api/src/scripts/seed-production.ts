import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { generatePassword } from '@/modules/identity/domain/passwordGenerator.js';
import { DESIGNATION_LEVEL, DESIGNATION_NAMES } from '@/modules/identity/domain/designation.entity.js';
import { payBandNameKey } from '@/modules/identity/domain/payBand.entity.js';
import { DesignationModel } from '@/modules/identity/infrastructure/designation.schema.js';
import { PayBandModel } from '@/modules/identity/infrastructure/payBand.schema.js';
import { UserModel } from '@/modules/identity/infrastructure/user.schema.js';
import { seedBaseline } from './baselineSeed.js';
import { seedDemoAccounts } from './demoAccounts.js';
import { adminFromEnv, parsePayBands, refusalReason } from './productionSeed.js';

/**
 * The first seed of an EMPTY production database, with no prompts. It refuses unless NODE_ENV is production, the database
 * named in MONGO_URI was repeated in --confirm-db, and the database has no users yet.
 *
 *   NODE_ENV=production ADMIN_CODE=… ADMIN_NAME=… ADMIN_EMAIL=… ADMIN_PHONE=… DEMO_MANAGER_PASSWORD=… \
 *     node dist/scripts/seed-production.js --confirm-db=greynote-prod [--pay-bands=prod-seed/payBands.json]
 *
 * It seeds the config defaults, roles, pay components and leave types, the five designations, the pay bands from the
 * reviewed file, the first Admin (random password, printed once, never stored anywhere else) and the Play reviewer's
 * demo accounts.
 */
const flag = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  try {
    const refusal = refusalReason({
      nodeEnv: env.NODE_ENV,
      mongoUri: env.MONGO_URI,
      confirmDb: flag('confirm-db'),
      existingUsers: await UserModel.estimatedDocumentCount(),
    });
    if (refusal) throw new Error(refusal);

    // Read everything that can be wrong before the first write.
    const admin = adminFromEnv(process.env);
    const demoPassword = process.env['DEMO_MANAGER_PASSWORD'];
    if (!demoPassword) throw new Error('Set DEMO_MANAGER_PASSWORD (the demo accounts’ password, as given to Google Play).');
    const bands = parsePayBands(JSON.parse(await readFile(flag('pay-bands') ?? 'prod-seed/payBands.json', 'utf8')));

    const identity = await seedBaseline();

    for (const name of DESIGNATION_NAMES) {
      await DesignationModel.updateOne({ name }, { $setOnInsert: { name, level: DESIGNATION_LEVEL[name] } }, { upsert: true });
    }
    logger.info({ designations: DESIGNATION_NAMES }, 'designations seeded');

    for (const band of bands) {
      await PayBandModel.updateOne({ nameKey: payBandNameKey(band.name) }, { $setOnInsert: { ...band, nameKey: payBandNameKey(band.name) } }, { upsert: true });
    }
    logger.info({ count: bands.length }, 'pay bands seeded');

    const password = generatePassword(16);
    await identity.seedBootstrapAdmin({ ...admin, password });
    await seedDemoAccounts(demoPassword, { resetPassword: false });

    // Printed straight to the terminal, not through the logger, so it never lands in a log file.
    process.stdout.write(`\nAdmin ${admin.employeeCode} created.\nPassword (shown once — save it now): ${password}\n\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  logger.fatal({ err: String(err) }, 'seed-production refused or failed');
  process.exitCode = 1;
});
