import mongoose from 'mongoose';
import prompts from 'prompts';
import { buildApprovalContainer } from '@/modules/approval/approval.container.js';
import { buildConfigContainer } from '@/modules/config/config.container.js';
import { buildHrContainer } from '@/modules/hr/hr.container.js';
import { buildIdentityContainer } from '@/modules/identity/identity.container.js';
import { buildSyncContainer } from '@/modules/sync/sync.container.js';
import { buildTerritoryContainer } from '@/modules/territory/territory.container.js';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * A second composition root (docs/engineering/module-anatomy.md's "worker process, a script"
 * case) — builds the same module containers `container.ts` does, but never serves HTTP and
 * exits when finished. Run explicitly by an operator, never automatically on server boot:
 *
 *   pnpm --filter @greynote/api seed     (dev, via tsx)
 *   node dist/scripts/seed.js            (prod, inside the running container — see
 *                                          docs/manual_deploy.md)
 *
 * Every step is idempotent — safe to re-run at any time, including against a live prod DB,
 * without touching a value an Admin has since edited. See docs/decision-log.md for why this
 * moved out of the server's boot path (a plaintext admin password shouldn't sit in `.env`
 * indefinitely, and seeding should be an explicit action, not an implicit side effect of `npm
 * start`).
 */
async function main(): Promise<void> {
  await mongoose.connect(env.MONGO_URI);
  logger.info('connected to MongoDB');

  const config = buildConfigContainer();
  await config.seed();
  logger.info('SystemConfig defaults seeded (existing Admin-edited values untouched)');

  const identity = buildIdentityContainer(config.contract);
  await identity.seedRoles();
  logger.info('Role rows seeded');
  await identity.seedPayComponents();
  logger.info('CTC pay components seeded (existing Admin-edited formula untouched)');

  const approval = buildApprovalContainer(identity.contract, config.contract);
  // HR registers its slice of the phone's cache with Sync as it builds; a seed run just needs somewhere to put it.
  const sync = buildSyncContainer(identity.contract, config.contract);
  const hr = buildHrContainer(identity.contract, buildTerritoryContainer(identity.contract, config.contract).contract, approval.contract, sync.contract, config.contract);
  await hr.seed();
  logger.info('Starting leave types seeded (existing ones untouched)');

  if (await identity.hasAdmin()) {
    logger.info('An ADMIN user already exists — skipping bootstrap Admin creation.');
    return;
  }

  logger.info('No ADMIN user exists yet — creating the first one now.');

  const answers = await prompts(
    [
      {
        type: 'text',
        name: 'employeeCode',
        message: 'Employee code',
        validate: (value: string) => value.trim().length > 0 || 'Required',
      },
      {
        type: 'text',
        name: 'name',
        message: 'Full name',
        validate: (value: string) => value.trim().length > 0 || 'Required',
      },
      {
        type: 'text',
        name: 'email',
        message: 'Email',
        validate: (value: string) => /\S+@\S+\.\S+/.test(value) || 'Enter a valid email',
      },
      {
        type: 'text',
        name: 'phone',
        message: 'Phone',
        validate: (value: string) => value.trim().length > 0 || 'Required',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password (8-72 characters)',
        validate: (value: string) =>
          (value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72) ||
          'Must be at least 8 characters and at most 72 bytes (bcrypt’s limit)',
      },
      { type: 'password', name: 'passwordConfirm', message: 'Confirm password' },
    ],
    {
      onCancel: () => {
        logger.warn('Cancelled — no Admin user was created.');
        process.exitCode = 1;
      },
    },
  );

  // `onCancel` above sets an exit code but `prompts` still returns whatever was answered so far —
  // guard explicitly rather than trusting every field was actually filled in.
  if (!answers.password || answers.password !== answers.passwordConfirm) {
    logger.fatal('Passwords did not match, or entry was cancelled — no Admin user was created.');
    process.exitCode = 1;
    return;
  }

  await identity.seedBootstrapAdmin({
    employeeCode: answers.employeeCode,
    name: answers.name,
    email: answers.email,
    phone: answers.phone,
    password: answers.password,
  });

  logger.info({ employeeCode: answers.employeeCode }, 'bootstrap Admin created');
}

main()
  .catch((cause: unknown) => {
    logger.fatal({ err: String(cause) }, 'seed script failed');
    process.exitCode = 1;
  })
  .finally(() => {
    mongoose.disconnect().catch(() => undefined);
  });
