import { beforeEach, describe, expect, it } from 'vitest';
import { GateRefusal } from '../../domain/gateRefusal.js';
import { LogRefusal } from '../../domain/logRefusal.js';
import { faKit, Tx } from './faTestKit.js';

const DAY = '2026-10-05';
const AT = new Date('2026-10-05T04:00:00Z'); // 09:30 IST
const REC = { userId: 'mr1', clientId: 'client-1', recordedAt: AT };
const CLINIC = { latitude: 26.7271, longitude: 88.3953 };
const metersNorth = (m: number) => ({ latitude: CLINIC.latitude + m / 111_195, longitude: CLINIC.longitude });

async function refusal(p: Promise<unknown>): Promise<GateRefusal | LogRefusal> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err instanceof GateRefusal || err instanceof LogRefusal).toBe(true);
  return err as GateRefusal | LogRefusal;
}

describe('logging the day’s calls and follow-ups', () => {
  let kit: ReturnType<typeof faKit>;
  let tx: Tx;
  const call = (over: Record<string, unknown> = {}) => ({ reportDate: DAY, doctorId: 'd1', workingType: 'FIELD_WORK' as const, workWith: [] as string[], remarks: null, capturedLocation: CLINIC as { latitude: number; longitude: number } | null, accuracyMeters: 10 as number | null, samples: [] as Array<{ productId: string; quantity: number }>, ...over });
  const chemistCall = (over: Record<string, unknown> = {}) => ({ reportDate: DAY, chemistId: 'c1', workingType: 'FIELD_WORK' as const, workWith: [] as string[], remarks: null, capturedLocation: CLINIC as { latitude: number; longitude: number } | null, accuracyMeters: 10 as number | null, ...over });
  const log = (over: Record<string, unknown> = {}, rec = REC) => kit.logDoctorCall.execute(rec, call(over), tx);

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    tx = new Tx();
  });

  describe('the day’s approved Plan bounds the report', () => {
    it('a call on a route the Plan doesn’t list is refused, Doctor or Chemist, and nothing is stored', async () => {
      kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-2'] });
      expect((await refusal(log())).code).toBe('ROUTE_NOT_IN_PLAN');
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall(), tx))).code).toBe('ROUTE_NOT_IN_PLAN');
      expect(kit.doctorCalls.rows).toHaveLength(0);
      expect(kit.chemistCalls.rows).toHaveLength(0);
    });

    it('a meeting day (no routes) has no calls', async () => {
      kit.planning.days.set(`mr1:${DAY}`, { workingType: 'MEETING', routeIds: [] });
      expect((await refusal(log())).code).toBe('ROUTE_NOT_IN_PLAN');
    });

    it('once the manager amends the plan to include the route, the call is accepted', async () => {
      kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-2'] });
      await refusal(log());
      kit.planning.days.set(`mr1:${DAY}`, { workingType: 'FIELD_WORK', routeIds: ['route-1', 'route-2'] });
      await log();
      expect(kit.doctorCalls.rows).toHaveLength(1);
    });
  });

  describe('a Doctor Call', () => {
    it('is stored on the day’s DCR, created by the first record, and answers with the server’s geofence result', async () => {
      const { serverId, data } = await log();
      expect(kit.dcrs.rows).toHaveLength(1);
      expect(kit.doctorCalls.rows[0]).toMatchObject({ id: serverId, dcrId: kit.dcrs.rows[0]!.id, userId: 'mr1', doctorId: 'd1', reportDate: DAY, clientId: 'client-1', workingType: 'FIELD_WORK' });
      expect(data).toEqual({ geofence: { status: 'PASS', distanceMeters: 0, reason: null } });
      await kit.logDoctorCall.execute({ ...REC, clientId: 'client-2' }, call(), tx);
      expect(kit.dcrs.rows).toHaveLength(1); // the second call joins the same DCR
      expect(kit.doctorCalls.rows).toHaveLength(2);
    });

    describe('the geofence is the server’s own', () => {
      it('PASS inside the radius, FAIL outside — flagged, never refused, and the call is still stored', async () => {
        expect((await log({ capturedLocation: metersNorth(90) })).data.geofence).toMatchObject({ status: 'PASS', distanceMeters: 90 });
        const far = await kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: metersNorth(400) }), tx);
        expect(far.data.geofence).toMatchObject({ status: 'FAIL', distanceMeters: 400, reason: null });
        expect(kit.doctorCalls.rows).toHaveLength(2);
        expect(kit.doctorCalls.rows[1]!.geofence).toMatchObject({ status: 'FAIL', overriddenBy: null });
      });

      it('follows the radius in Config, so Admin can change it without a release', async () => {
        kit.config.values.GEO_FENCE_RADIUS_METERS = '50';
        expect((await log({ capturedLocation: metersNorth(90) })).data.geofence.status).toBe('FAIL');
        kit.config.values.GEO_FENCE_RADIUS_METERS = '150';
        expect((await kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: metersNorth(90) }), tx)).data.geofence.status).toBe('PASS');
      });

      it('UNVERIFIED — flagged for the manager like a FAIL — when there is no registered location, no GPS reading, or a weak one', async () => {
        kit.fmd.doctorLocation['d1'] = null;
        expect((await log()).data.geofence).toEqual({ status: 'UNVERIFIED', distanceMeters: null, reason: 'NO_REGISTERED_LOCATION' });
        kit.fmd.doctorLocation['d1'] = CLINIC;
        expect((await kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: null, accuracyMeters: null }), tx)).data.geofence.reason).toBe('NO_GPS_READING');
        expect((await kit.logDoctorCall.execute({ ...REC, clientId: 'c3' }, call({ accuracyMeters: 300 }), tx)).data.geofence).toMatchObject({ status: 'UNVERIFIED', reason: 'LOW_ACCURACY', distanceMeters: 0 });
        expect(kit.doctorCalls.rows).toHaveLength(3);
      });

      it('a geofence result sent by the phone is never taken', async () => {
        const { data } = await kit.logDoctorCall.execute(REC, { ...call({ capturedLocation: metersNorth(900) }), geofenceStatus: 'PASS' } as never, tx);
        expect(data.geofence.status).toBe('FAIL');
      });
    });

    describe('the gate', () => {
      it('a blocked MR, an unapproved Plan, another day, a future day and a locked DCR are all refused before anything is written', async () => {
        kit.users.users.get('mr1')!.blocked = true;
        expect((await refusal(log())).code).toBe('USER_BLOCKED');
        kit.users.users.get('mr1')!.blocked = false;
        kit.planning.approved.clear();
        expect((await refusal(log())).code).toBe('DAILY_PLAN_NOT_APPROVED');
        kit.planning.approve('mr1', DAY);
        expect((await refusal(log({ reportDate: '2026-10-04' }))).code).toBe('DATE_MISMATCH');
        expect((await refusal(log({ reportDate: '2026-10-09' }))).code).toBe('DATE_IN_FUTURE');
        const dcr = await kit.dcrs.getOrCreate('mr1', DAY);
        await kit.approvals.submit({ kind: 'DCR', recordId: dcr.id, submitterId: 'mr1' });
        expect((await refusal(log())).code).toBe('DCR_LOCKED');
        expect(kit.doctorCalls.rows).toHaveLength(0);
      });
    });

    describe('the Doctor, as it is now (master-data drift)', () => {
      it('one who no longer exists or is inactive → DOCTOR_NOT_FOUND', async () => {
        expect((await refusal(log({ doctorId: 'nobody' }))).code).toBe('DOCTOR_NOT_FOUND');
        kit.fmd.doctors.get('d1')!.status = 'inactive';
        expect((await refusal(log())).code).toBe('DOCTOR_NOT_FOUND');
      });

      it('one Admin reassigned to another MR while the phone was offline → DOCTOR_NOT_ASSIGNED, nothing stored', async () => {
        kit.fmd.assigned.delete('mr1:d1');
        const r = await refusal(log());
        expect(r.code).toBe('DOCTOR_NOT_ASSIGNED');
        expect(r.message).toContain('no longer assigned');
        expect(kit.doctorCalls.rows).toHaveLength(0);
      });
    });

    describe('work-with colleagues', () => {
      it('active colleagues, each once, never themselves', async () => {
        expect((await log({ workWith: ['mr2', 'asm'] })).serverId).toBeDefined();
        for (const bad of [['mr1'], ['mr2', 'mr2'], ['nobody']]) expect((await refusal(log({ workWith: bad }))).code).toBe('INVALID_WORK_WITH');
        kit.users.users.get('mr2')!.status = 'inactive';
        expect((await refusal(log({ workWith: ['mr2'] }))).code).toBe('INVALID_WORK_WITH');
      });
    });

    describe('samples given', () => {
      it('draw the Doctor’s allocation down by exactly what was given, and are kept on the call', async () => {
        await log({ samples: [{ productId: 'p1', quantity: 4 }, { productId: 'p2', quantity: 1 }] });
        expect(kit.fmd.allocations.get('d1:p1')!.quantityRemaining).toBe(6);
        expect(kit.fmd.allocations.get('d1:p2')!.quantityRemaining).toBe(2);
        expect(kit.doctorCalls.rows[0]!.samples).toEqual([
          { allocationId: 'a1', productId: 'p1', quantity: 4 },
          { allocationId: 'a2', productId: 'p2', quantity: 1 },
        ]);
      });

      it('a line the allocation can’t cover → SAMPLES_EXHAUSTED, and the lines before it and the call itself are undone', async () => {
        const err = await refusal(log({ samples: [{ productId: 'p1', quantity: 4 }, { productId: 'p2', quantity: 5 }] }));
        expect(err.code).toBe('SAMPLES_EXHAUSTED');
        expect(err.message).toContain('3 available');
        tx.rollback(); // what the sync engine does when the record fails
        expect(kit.fmd.allocations.get('d1:p1')!.quantityRemaining).toBe(10); // p1's earlier draw-down undone
        expect(kit.doctorCalls.rows).toHaveLength(0);
      });

      it('a product never issued for this Doctor → NO_SAMPLE_ALLOCATION', async () => {
        expect((await refusal(log({ samples: [{ productId: 'p9', quantity: 1 }] }))).code).toBe('NO_SAMPLE_ALLOCATION');
      });

      it('two calls racing for the last units: as many succeed as there is stock', async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 8 }, (_, i) => kit.logDoctorCall.execute({ ...REC, clientId: `race-${i}` }, call({ samples: [{ productId: 'p2', quantity: 1 }] }), new Tx())),
        );
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3); // p2 had 3
        expect(kit.fmd.allocations.get('d1:p2')!.quantityRemaining).toBe(0);
      });
    });
  });

  describe('a Chemist Call', () => {
    it('is stored with the server’s geofence result, checked against the Chemist’s stored location', async () => {
      const { data, serverId } = await kit.logChemistCall.execute(REC, chemistCall({ capturedLocation: metersNorth(250) }), tx);
      expect(data.geofence).toMatchObject({ status: 'FAIL', distanceMeters: 250 });
      expect(kit.chemistCalls.rows[0]).toMatchObject({ id: serverId, chemistId: 'c1', userId: 'mr1' });
    });

    it('a Chemist that no longer exists → CHEMIST_NOT_FOUND; on a Route the MR lost → CHEMIST_ROUTE_NOT_ASSIGNED', async () => {
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall({ chemistId: 'nobody' }), tx))).code).toBe('CHEMIST_NOT_FOUND');
      kit.fmd.chemists.get('c1')!.status = 'inactive';
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall(), tx))).code).toBe('CHEMIST_NOT_FOUND');
      kit.fmd.chemists.get('c1')!.status = 'active';
      kit.territory.routesByUser.set('mr1', ['route-2']);
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall(), tx))).code).toBe('CHEMIST_ROUTE_NOT_ASSIGNED');
      expect(kit.chemistCalls.rows).toHaveLength(0);
    });

    it('goes through the same gate', async () => {
      kit.planning.approved.clear();
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall(), tx))).code).toBe('DAILY_PLAN_NOT_APPROVED');
    });
  });

  describe('follow-ups', () => {
    it('a Doctor follow-up and a Chemist follow-up are attached to the day’s DCR', async () => {
      const d = await kit.logFollowup.execute(REC, { reportDate: DAY, subject: 'DOCTOR', subjectId: 'd1', remarks: 'call again Friday' }, tx);
      const c = await kit.logFollowup.execute({ ...REC, clientId: 'client-2' }, { reportDate: DAY, subject: 'CHEMIST', subjectId: 'c1', remarks: 'restock' }, tx);
      expect(kit.followups.rows.map((f) => [f.id, f.subject, f.remarks])).toEqual([[d.serverId, 'DOCTOR', 'call again Friday'], [c.serverId, 'CHEMIST', 'restock']]);
      expect(kit.dcrs.rows).toHaveLength(1);
    });

    it('is refused by the gate and by the same checks on who it is about', async () => {
      kit.fmd.assigned.delete('mr1:d1');
      expect((await refusal(kit.logFollowup.execute(REC, { reportDate: DAY, subject: 'DOCTOR', subjectId: 'd1', remarks: 'x' }, tx))).code).toBe('DOCTOR_NOT_ASSIGNED');
      kit.territory.routesByUser.set('mr1', []);
      expect((await refusal(kit.logFollowup.execute(REC, { reportDate: DAY, subject: 'CHEMIST', subjectId: 'c1', remarks: 'x' }, tx))).code).toBe('CHEMIST_ROUTE_NOT_ASSIGNED');
      kit.users.users.get('mr1')!.blocked = true;
      expect((await refusal(kit.logFollowup.execute(REC, { reportDate: DAY, subject: 'DOCTOR', subjectId: 'd1', remarks: 'x' }, tx))).code).toBe('USER_BLOCKED');
    });
  });
});
