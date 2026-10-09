import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: the employee list shows each employee's zone without asking Territory, so the profile keeps a copy of
 * the CURRENT HQ and its zone (decision-log 2026-10-09). Territory writes it from now on; this fills it in for everyone who
 * already has an HQ.
 *
 *   EmployeeProfile: hqId, zoneId = the employee's active UserHqAssignment and that HQ's zone
 *
 * Employees with no HQ are left alone. Run it any time after the version that has the fields is deployed:
 *
 *   pnpm --filter @greynote/api migrate:profile-territory                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:profile-territory -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:profile-territory -- --apply --backup ./profile-territory-backup.json
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./profile-territory-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'profile territory migration');

  const assignments = await db.collection('userhqassignments').find({ status: 'active' }).toArray();
  const hqs = new Map((await db.collection('hqs').find().toArray()).map((h) => [String(h._id), h]));

  const plan: Array<{ userId: unknown; hqId: unknown; zoneId: unknown; before: { hqId: unknown; zoneId: unknown } | null }> = [];
  let noHq = 0;
  let noProfile = 0;
  for (const a of assignments) {
    const hq = hqs.get(String(a.hqId));
    if (!hq) {
      noHq++;
      logger.warn({ userId: String(a.userId), hqId: String(a.hqId) }, 'assignment points at an HQ that does not exist: skipped');
      continue;
    }
    const profile = await db.collection('employeeprofiles').findOne({ userId: a.userId });
    if (!profile) {
      noProfile++;
      logger.warn({ userId: String(a.userId) }, 'no employee profile yet: skipped (it is filled in when the profile is created and the HQ is saved again)');
      continue;
    }
    if (String(profile.hqId ?? '') === String(a.hqId) && String(profile.zoneId ?? '') === String(hq.zoneId)) continue;
    plan.push({ userId: a.userId, hqId: a.hqId, zoneId: hq.zoneId, before: { hqId: profile.hqId ?? null, zoneId: profile.zoneId ?? null } });
  }

  logger.info({ toUpdate: plan.length, skippedNoHq: noHq, skippedNoProfile: noProfile, withHq: assignments.length }, 'plan');
  if (plan.length === 0) {
    logger.info('nothing to change — already up to date');
    return;
  }
  if (!apply) {
    logger.info('dry run only — repeat with --apply to write');
    return;
  }

  writeFileSync(backupPath!, JSON.stringify(plan, null, 2));
  logger.info({ backupPath }, 'backup written');
  for (const p of plan) {
    await db.collection('employeeprofiles').updateOne({ userId: p.userId }, { $set: { hqId: p.hqId, zoneId: p.zoneId } });
  }
  const left = (
    await Promise.all(
      plan.map(async (p) => (await db.collection('employeeprofiles').countDocuments({ userId: p.userId, hqId: p.hqId, zoneId: p.zoneId })) === 0),
    )
  ).filter(Boolean).length;
  if (left > 0) throw new Error(`verification failed: ${left} profile(s) not updated.`);
  logger.info({ updated: plan.length }, 'profiles updated and verified');
}

main()
  .catch((err) => {
    logger.error({ err }, 'profile territory migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
