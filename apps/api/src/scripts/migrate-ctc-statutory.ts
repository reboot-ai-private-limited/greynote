import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { ConfigCtcContext } from '../modules/identity/application/usecases/ctcContext.js';
import { ReapplyCtcUseCase } from '../modules/identity/application/usecases/reapplyCtc.usecase.js';
import { MongoCtcAssignmentAdapter } from '../modules/identity/infrastructure/mongoCtcAssignment.adapter.js';
import { MongoPayComponentAdapter } from '../modules/identity/infrastructure/mongoPayComponent.adapter.js';
import { SystemConfigModel } from '../modules/config/infrastructure/systemConfig.schema.js';
import { AppError } from '@/shared/errors/AppError.js';
import { planFormula } from './ctcStatutoryMigration.js';

/**
 * One-off, idempotent: the CTC becomes the employee's total earnings, EPF/ESI become the employee's deductions and professional tax is a
 * mandatory deduction from the slabs in Settings (decision-log 2026-10-14). Run `seed` first so `PTAX_SLABS` and `ESI_WAGE_CEILING` exist.
 *
 *  1. Moves the org's pay components to the new shape (EPF/ESI to deductions, ESI as a share of the total within the ceiling, HRA and
 *     Conveyance added if missing, professional tax added and made mandatory). What Admin already set is kept.
 *  2. Re-applies the new formula to every employee's latest CTC as a new revision from `--from YYYY-MM` (same CTC, same own structure).
 *     An employee whose monthly salary is under the lowest professional tax slab, or whose lines no longer fit, is listed and left as they are.
 *
 *   pnpm --filter @greynote/api migrate:ctc-statutory -- --from 2026-10            dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:ctc-statutory -- --from 2026-10 --apply    writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const at = process.argv.indexOf('--from');
  const from = at >= 0 ? process.argv[at + 1] : undefined;
  if (!from || !/^\d{4}-(0[1-9]|1[0-2])$/.test(from)) throw new Error('Pass the first month the new formula applies from: --from YYYY-MM');
  await mongoose.connect(env.MONGO_URI);

  const components = new MongoPayComponentAdapter();
  const assignments = new MongoCtcAssignmentAdapter();
  const plan = planFormula(await components.list());
  logger.info({ updates: plan.updates.map((u) => ({ code: u.code, ...u.patch })), creates: plan.creates.map((c) => c.code) }, apply ? 'applying the formula' : 'dry run — nothing is written');
  for (const note of plan.notes) logger.info(note);
  if (plan.problem) throw new Error(`The planned formula is not valid, so nothing was changed: ${plan.problem}`);

  if (apply) {
    for (const u of plan.updates) await components.update(u.id, u.patch);
    for (const c of plan.creates) await components.create(c);
  }

  // The employees: against the formula as it will be. A dry run cannot read it back, so it computes from the plan.
  const config = {
    get: async (key: string): Promise<string> => {
      const doc = await SystemConfigModel.findOne({ key }).lean();
      if (!doc) throw AppError.internal('INTERNAL', { reason: 'CONFIG_KEY_MISSING', key });
      return doc.value;
    },
  };
  const source = apply ? components : { list: async () => plan.result, findById: async () => null, create: async () => { throw new Error('read only'); }, update: async () => { throw new Error('read only'); } };
  const sink = apply ? assignments : Object.assign(Object.create(assignments) as typeof assignments, { create: async (input: Parameters<typeof assignments.create>[0]) => ({ ...input, id: 'dry-run', createdAt: new Date() }) });
  const outcomes = await new ReapplyCtcUseCase(source as never, sink as never, new ConfigCtcContext(config)).execute({ effectiveFrom: from, reason: 'Formula updated: EPF, ESI and professional tax as deductions' }, new mongoose.Types.ObjectId().toString());
  const revised = outcomes.filter((o) => o.outcome === 'revised').length;
  const skipped = outcomes.filter((o): o is Extract<typeof o, { outcome: 'skipped' }> => o.outcome === 'skipped');
  logger.info({ employees: outcomes.length, revised, skipped: skipped.length }, apply ? 'CTCs re-applied' : 'CTCs that would be re-applied');
  for (const s of skipped) logger.warn({ userId: s.userId, why: s.message }, 'left as it was: HR to review');
  if (!apply) logger.info('Run again with --apply to write.');
  await mongoose.disconnect();
}

main().catch((err) => {
  logger.error({ err }, 'migration failed');
  process.exit(1);
});
