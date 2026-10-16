import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '@/config/env.js';
import { logger } from '@/shared/logging/logger.js';

/**
 * One-off, idempotent: every field employee now has a stored Zone and HQ list (ManagerCoverage), so the employee page and onboarding pick Zone
 * first, then its HQs (decision-log 2026-10-16). Territory writes it from now on; this fills it in for people set up before.
 *
 *   MR, ASM, RSM with no coverage record   -> create one: hqIds = [their current HQ], zoneIds = [that HQ's Zone]
 *   MR, ASM, RSM with a coverage record    -> zoneIds = their zoneIds plus the Zone of every HQ they cover
 *   ZSM, NSM, and anyone with no HQ        -> left alone (a ZSM or NSM picks Zones by hand)
 *
 * Run it any time after the version that stores Zones is deployed:
 *
 *   pnpm --filter @greynote/api migrate:territory-zones                       dry run — changes nothing, reports
 *   pnpm --filter @greynote/api migrate:territory-zones -- --apply            writes; saves a backup first
 *   pnpm --filter @greynote/api migrate:territory-zones -- --apply --backup ./territory-zones-backup.json
 */
const FIELD_LEVELS = new Set(['MR', 'ASM', 'RSM']);

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const backupFlag = process.argv.indexOf('--backup');
  const backupPath = backupFlag >= 0 ? process.argv[backupFlag + 1] : `./territory-zones-backup-${Date.now()}.json`;

  await mongoose.connect(env.MONGO_URI);
  const db = mongoose.connection.db!;
  logger.info({ database: db.databaseName, mode: apply ? 'APPLY' : 'dry run' }, 'territory zones migration');

  const hqs = new Map((await db.collection('hqs').find().toArray()).map((h) => [String(h._id), h]));
  const designations = new Map((await db.collection('designations').find().toArray()).map((d) => [String(d._id), String(d.name)]));
  const adminRole = await db.collection('roles').findOne({ name: 'ADMIN' });
  const admin = adminRole ? await db.collection('users').findOne({ roleId: adminRole._id }) : null;
  if (!admin) throw new Error('No Admin user to record as the writer of the new coverage rows.');

  const profiles = await db.collection('employeeprofiles').find().toArray();
  const designationOf = new Map(profiles.map((p) => [String(p.userId), designations.get(String(p.designationId))]));
  const active = await db.collection('userhqassignments').find({ status: 'active' }).toArray();
  const mainHq = new Map(active.map((a) => [String(a.userId), String(a.hqId)]));
  const coverages = new Map((await db.collection('managercoverages').find().toArray()).map((c) => [String(c.userId), c]));

  const zoneOf = (hqId: string): string | null => (hqs.get(hqId) ? String(hqs.get(hqId)!.zoneId) : null);
  const creates: Array<{ userId: string; hqIds: string[]; zoneIds: string[] }> = [];
  const updates: Array<{ userId: string; before: string[]; zoneIds: string[] }> = [];
  const odd: Array<{ userId: string; reason: string }> = [];

  const people = new Set([...mainHq.keys(), ...coverages.keys()]);
  for (const userId of people) {
    const name = designationOf.get(userId);
    if (!name || !FIELD_LEVELS.has(name)) continue;
    const cov = coverages.get(userId);
    const hqIds: string[] = cov?.hqIds?.length ? (cov.hqIds as unknown[]).map(String) : mainHq.has(userId) ? [mainHq.get(userId)!] : [];
    if (hqIds.length === 0) {
      odd.push({ userId, reason: 'no HQ at all' });
      continue;
    }
    const missing = hqIds.filter((id) => !zoneOf(id));
    if (missing.length > 0) odd.push({ userId, reason: `HQ ${missing.join(',')} does not exist` });
    const have: string[] = ((cov?.zoneIds ?? []) as unknown[]).map(String);
    const want = [...new Set([...have, ...hqIds.map(zoneOf).filter((z): z is string => z !== null)])];
    if (!cov) creates.push({ userId, hqIds, zoneIds: want });
    else if (want.length !== have.length || want.some((z) => !have.includes(z))) {
      updates.push({ userId, before: have, zoneIds: want });
    }
  }

  logger.info({ toCreate: creates.length, toUpdate: updates.length, odd: odd.length }, 'plan');
  for (const o of odd) logger.warn(o, 'needs a look: skipped or incomplete');
  if (creates.length + updates.length === 0) {
    logger.info('nothing to change — already up to date');
    return;
  }
  if (!apply) {
    logger.info('dry run only — repeat with --apply to write');
    return;
  }

  const oid = (s: string) => new mongoose.Types.ObjectId(s);
  writeFileSync(backupPath!, JSON.stringify({ creates, updates }, null, 2));
  logger.info({ backupPath }, 'backup written');
  const now = new Date();
  for (const c of creates) {
    await db.collection('managercoverages').insertOne({ userId: oid(c.userId), hqIds: c.hqIds.map(oid), zoneIds: c.zoneIds.map(oid), updatedAt: now, updatedBy: admin._id });
  }
  for (const u of updates) {
    await db.collection('managercoverages').updateOne({ userId: oid(u.userId) }, { $set: { zoneIds: u.zoneIds.map(oid), updatedAt: now, updatedBy: admin._id } });
  }
  logger.info({ created: creates.length, updated: updates.length }, 'coverage written');
}

main()
  .catch((err) => {
    logger.error({ err }, 'territory zones migration failed');
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
