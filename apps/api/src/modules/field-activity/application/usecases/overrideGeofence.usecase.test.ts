import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { faKit, Tx } from './faTestKit.js';
import { OverrideGeofenceUseCase } from './overrideGeofence.usecase.js';

const DAY = '2026-10-05';
const REC = { userId: 'mr1', clientId: 'c-1', recordedAt: new Date('2026-10-05T04:00:00Z') };
const CLINIC = { latitude: 26.7271, longitude: 88.3953 };
const north = (m: number) => ({ latitude: CLINIC.latitude + m / 111_195, longitude: CLINIC.longitude });

async function statusOf(p: Promise<unknown>): Promise<number> {
  const err = await p.then(() => undefined, (e: unknown) => e);
  expect(err).toBeInstanceOf(AppError);
  return (err as AppError).statusCode;
}

describe('accepting a flagged call (geofence override)', () => {
  let kit: ReturnType<typeof faKit>;
  let override: OverrideGeofenceUseCase;
  let dcrId: string;
  let failId: string, passId: string, chemistFailId: string;
  const mgr = { id: 'asm', role: 'FIELD' as const };
  const admin = { id: 'admin', role: 'ADMIN' as const };
  const NOW = new Date('2026-10-05T12:00:00Z');

  beforeEach(async () => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    const tx = new Tx();
    // Calls that failed the check can no longer be recorded (they are refused), so the flagged ones here are legacy rows kept from before.
    const doc = { reportDate: DAY, doctorId: 'd1', workWith: [], remarks: null, capturedLocation: CLINIC as typeof CLINIC | null, accuracyMeters: 5, samples: [] };
    passId = (await kit.logDoctorCall.execute(REC, doc, tx)).serverId;
    failId = (await kit.logDoctorCall.execute({ ...REC, clientId: 'c-2' }, doc, tx)).serverId;
    chemistFailId = (await kit.logChemistCall.execute({ ...REC, clientId: 'c-3' }, { reportDate: DAY, chemistId: 'c1', workWith: [], remarks: null, capturedLocation: CLINIC, accuracyMeters: 5 }, tx)).serverId;
    const failing = { status: 'FAIL' as const, distanceMeters: 400, reason: null, overriddenBy: null, overriddenAt: null, overrideComment: null };
    kit.doctorCalls.rows.find((r) => r.id === failId)!.geofence = failing;
    kit.chemistCalls.rows.find((r) => r.id === chemistFailId)!.geofence = { ...failing, status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_GPS_READING' };
    dcrId = (await kit.submit.execute('mr1', DAY, REC.recordedAt, tx)).dcrId;
    override = new OverrideGeofenceUseCase(kit.dcrs, kit.users, kit.views, kit.doctorCalls, kit.chemistCalls);
  });

  it('the nearest manager accepts a FAIL: OVERRIDE with who, when and why, the computed distance kept', async () => {
    const call = await override.execute(mgr, dcrId, failId, 'Met him at the clinic next door', NOW);
    expect(call.geofence).toMatchObject({ status: 'OVERRIDE', distanceMeters: 400, overriddenBy: 'asm', overriddenAt: NOW, overrideComment: 'Met him at the clinic next door' });
  });

  it('an UNVERIFIED call (no GPS) can be accepted too, and the reason stays', async () => {
    const call = await override.execute(mgr, dcrId, chemistFailId, 'Basement, no signal', NOW);
    expect(call.geofence).toMatchObject({ status: 'OVERRIDE', reason: 'NO_GPS_READING' });
  });

  it('accepting one flagged call leaves the other flagged and the DCR undecided', async () => {
    await override.execute(mgr, dcrId, failId, 'ok', NOW);
    expect(kit.chemistCalls.rows[0]!.geofence.status).toBe('UNVERIFIED');
    expect((await kit.views.one(kit.dcrs.rows[0]!)).status).toBe('SUBMITTED');
  });

  it('a PASS call, and a call already accepted, are 409', async () => {
    expect(await statusOf(override.execute(mgr, dcrId, passId, 'x', NOW))).toBe(409);
    await override.execute(mgr, dcrId, failId, 'x', NOW);
    expect(await statusOf(override.execute(admin, dcrId, failId, 'again', NOW))).toBe(409);
  });

  it('who may: the nearest manager and Admin; not the owner, not a stranger', async () => {
    expect(await statusOf(override.execute({ id: 'mr1', role: 'FIELD' }, dcrId, failId, 'x', NOW))).toBe(403);
    expect(await statusOf(override.execute({ id: 'stranger', role: 'FIELD' }, dcrId, failId, 'x', NOW))).toBe(403);
    await override.execute(admin, dcrId, failId, 'Admin accepts', NOW);
  });

  it('once the manager has approved, only Admin (the final stage) can still accept', async () => {
    kit.approvals.setStatus(dcrId, 'MANAGER_APPROVED');
    expect(await statusOf(override.execute(mgr, dcrId, failId, 'x', NOW))).toBe(403);
    expect((await override.execute(admin, dcrId, failId, 'x', NOW)).geofence.status).toBe('OVERRIDE');
  });

  it('a DCR not under review (approved, rejected, or never submitted) is 409', async () => {
    for (const s of ['APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
      kit.approvals.setStatus(dcrId, s);
      expect(await statusOf(override.execute(admin, dcrId, failId, 'x', NOW))).toBe(409);
    }
  });

  it('a call that is not on this DCR, or a DCR that does not exist, is 404', async () => {
    expect(await statusOf(override.execute(admin, dcrId, 'nope', 'x', NOW))).toBe(404);
    expect(await statusOf(override.execute(admin, 'nope', failId, 'x', NOW))).toBe(404);
  });
});
