import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';
import { SINGLE_APPROVAL_KINDS, finaliseWaiting, relaxWorkflow } from './singleApprovalMigration.js';

/**
 * One-off, idempotent (decision-log 2026-10-23): Monthly Plans, Daily Plans and Services now need ONE approval, the manager's or
 * Admin's. Requests already at MANAGER_APPROVED were waiting only for Admin; they become APPROVED. Nothing else needs to run:
 * the app and the monthly-plan inheritance already treated MANAGER_APPROVED as approved, and these kinds do nothing more on approval.
 * Requests still at SUBMITTED keep the two-step workflow they were submitted under (it is snapshotted), so a manager's approval would
 * still wait for Admin: their workflow becomes MANAGER_ONLY.
 *
 *   pnpm --filter @greynote/api migrate:single-approval                dry run — counts, changes nothing
 *   pnpm --filter @greynote/api migrate:single-approval -- --apply     writes
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(env.MONGO_URI);
  try {
    const requests = mongoose.connection.db!.collection('approvalrequests');
    const waiting = await requests.find({ kind: { $in: [...SINGLE_APPROVAL_KINDS] }, status: 'MANAGER_APPROVED' }).toArray();
    let changed = 0;
    let skipped = 0;
    const now = new Date();
    for (const request of waiting) {
      const update = finaliseWaiting({ cycle: request.cycle, history: request.history }, now);
      if (!update) {
        skipped += 1;
        continue;
      }
      if (apply) await requests.updateOne({ _id: request._id, status: 'MANAGER_APPROVED' }, update as unknown as Parameters<typeof requests.updateOne>[1]);
      changed += 1;
    }
    const submitted = await requests.find({ kind: { $in: [...SINGLE_APPROVAL_KINDS] }, status: 'SUBMITTED', workflow: 'MANAGER_THEN_FINAL' }).toArray();
    for (const request of submitted) {
      const update = relaxWorkflow({ workflow: request.workflow });
      if (update && apply) await requests.updateOne({ _id: request._id, status: 'SUBMITTED' }, update);
    }
    logger.info(
      { mode: apply ? 'APPLY' : 'dry run', waiting: waiting.length, changed, skippedNoManagerApproval: skipped, submittedRelaxed: submitted.length },
      'single approval',
    );
    if (!apply) logger.info('Run again with --apply to write.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error({ err }, 'single approval migration failed');
  process.exit(1);
});
