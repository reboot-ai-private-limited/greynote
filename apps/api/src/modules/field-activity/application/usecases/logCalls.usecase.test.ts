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
  const gps = { capturedLocation: CLINIC as { latitude: number; longitude: number } | null, accuracyMeters: 10 as number | null };
  const call = (over: Record<string, unknown> = {}) => ({ reportDate: DAY, doctorId: 'd1', workWith: [] as string[], remarks: null, ...gps, samples: [] as Array<{ productId: string; quantity: number }>, ...over });
  const chemistCall = (over: Record<string, unknown> = {}) => ({ reportDate: DAY, chemistId: 'c1', workWith: [] as string[], remarks: null, ...gps, ...over });
  const followup = (subject: 'DOCTOR' | 'CHEMIST', subjectId: string, over: Record<string, unknown> = {}) => ({ reportDate: DAY, subject, subjectId, remarks: 'call again Friday', ...gps, ...over });
  const log = (over: Record<string, unknown> = {}, rec = REC) => kit.logDoctorCall.execute(rec, call(over), tx);
  const plan = (over: { workingType?: 'FIELD_WORK' | 'DOCTOR_CAMPAIGN' | 'MEETING' | 'CONFERENCE' | 'STRIKE'; routeIds?: string[]; doctorIds?: string[] }) =>
    kit.planning.days.set(`mr1:${DAY}`, { workingType: over.workingType ?? 'FIELD_WORK', routeIds: over.routeIds ?? ['route-1'], ...(over.doctorIds && { doctorIds: over.doctorIds }) });

  beforeEach(() => {
    kit = faKit();
    kit.planning.approve('mr1', DAY);
    tx = new Tx();
  });

  describe('work type and route type are stamped by the server', () => {
    it('every record carries the day’s plan type and the Route’s type (HQ / Ex-station / Out-station)', async () => {
      await log();
      await kit.logChemistCall.execute({ ...REC, clientId: 'c2' }, chemistCall(), tx);
      await kit.logFollowup.execute({ ...REC, clientId: 'c3' }, followup('DOCTOR', 'd1'), tx);
      await kit.logFollowup.execute({ ...REC, clientId: 'c4' }, followup('CHEMIST', 'c1'), tx);
      for (const row of [...kit.doctorCalls.rows, ...kit.chemistCalls.rows, ...kit.followups.rows]) expect(row).toMatchObject({ workingType: 'FIELD_WORK', routeId: 'route-1', routeType: 'EX_STATION' });
    });

    it('a doctor campaign day is stamped as such', async () => {
      plan({ workingType: 'DOCTOR_CAMPAIGN' });
      await log();
      expect(kit.doctorCalls.rows[0]!.workingType).toBe('DOCTOR_CAMPAIGN');
    });

    it('the phone’s work type is ignored', async () => {
      await kit.logDoctorCall.execute(REC, { ...call(), workingType: 'STRIKE' } as never, tx);
      expect(kit.doctorCalls.rows[0]!.workingType).toBe('FIELD_WORK');
    });
  });

  describe('meeting, conference and strike days have no calls', () => {
    it.each(['MEETING', 'CONFERENCE', 'STRIKE'] as const)('%s: calls and follow-ups are refused, nothing stored', async (workingType) => {
      plan({ workingType, routeIds: [] });
      expect((await refusal(log())).code).toBe('CALL_NOT_ALLOWED_FOR_WORK_TYPE');
      expect((await refusal(kit.logChemistCall.execute(REC, chemistCall(), tx))).code).toBe('CALL_NOT_ALLOWED_FOR_WORK_TYPE');
      expect((await refusal(kit.logFollowup.execute(REC, followup('DOCTOR', 'd1'), tx))).code).toBe('CALL_NOT_ALLOWED_FOR_WORK_TYPE');
      expect(kit.doctorCalls.rows).toHaveLength(0);
      expect(kit.chemistCalls.rows).toHaveLength(0);
      expect(kit.followups.rows).toHaveLength(0);
    });
  });

  describe('the plan flags, it never refuses', () => {
    it('a Doctor on the day’s list is in plan, whatever their Route', async () => {
      plan({ routeIds: ['route-2'], doctorIds: ['d1'] });
      await log();
      expect(kit.doctorCalls.rows[0]).toMatchObject({ notInPlan: false, routeNotInPlan: true });
    });

    it('a Doctor not on the list is saved and flagged; on a listed Route only the Doctor flag shows', async () => {
      plan({ doctorIds: ['d9'] });
      await log();
      expect(kit.doctorCalls.rows[0]).toMatchObject({ notInPlan: true, routeNotInPlan: false });
    });

    it('a Doctor on a Route the plan doesn’t list is saved with both flags', async () => {
      plan({ routeIds: ['route-2'], doctorIds: ['d9'] });
      await log();
      expect(kit.doctorCalls.rows[0]).toMatchObject({ notInPlan: true, routeNotInPlan: true });
    });

    it('a plan that lists no Doctors falls back to the Route', async () => {
      plan({ doctorIds: [] });
      await log();
      expect(kit.doctorCalls.rows[0]!.notInPlan).toBe(false);
      plan({ routeIds: ['route-2'], doctorIds: [] });
      await kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call(), tx);
      expect(kit.doctorCalls.rows[1]!.notInPlan).toBe(true);
    });

    it('a Chemist call and follow-up are flagged when their Route isn’t on the plan', async () => {
      await kit.logChemistCall.execute(REC, chemistCall(), tx);
      await kit.logFollowup.execute({ ...REC, clientId: 'c2' }, followup('CHEMIST', 'c1'), tx);
      expect(kit.chemistCalls.rows[0]!.routeNotInPlan).toBe(false);
      expect(kit.followups.rows[0]!.notInPlan).toBe(false);
      plan({ routeIds: ['route-2'] });
      await kit.logChemistCall.execute({ ...REC, clientId: 'c3' }, chemistCall(), tx);
      await kit.logFollowup.execute({ ...REC, clientId: 'c4' }, followup('CHEMIST', 'c1'), tx);
      expect(kit.chemistCalls.rows[1]!.routeNotInPlan).toBe(true);
      expect(kit.followups.rows[1]!.notInPlan).toBe(true);
    });

    it('a Doctor follow-up is flagged when the Doctor isn’t on the day’s list', async () => {
      plan({ doctorIds: ['d1'] });
      await kit.logFollowup.execute(REC, followup('DOCTOR', 'd1'), tx);
      plan({ doctorIds: ['d9'] });
      await kit.logFollowup.execute({ ...REC, clientId: 'c2' }, followup('DOCTOR', 'd1'), tx);
      expect(kit.followups.rows.map((f) => f.notInPlan)).toEqual([false, true]);
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

    describe('the location rule: only where the Doctor is', () => {
      it('inside the radius is stored; outside is refused with NOT_AT_LOCATION and nothing is stored', async () => {
        expect((await log({ capturedLocation: metersNorth(90) })).data.geofence).toMatchObject({ status: 'PASS', distanceMeters: 90 });
        const err = await refusal(kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: metersNorth(400) }), tx));
        expect(err.code).toBe('NOT_AT_LOCATION');
        expect(err.message).toContain('400 m');
        expect(err.message).toContain('100 m');
        expect(kit.doctorCalls.rows).toHaveLength(1);
      });

      it('follows the radius in Config, so Admin can change it without a release', async () => {
        kit.config.values.GEO_FENCE_RADIUS_METERS = '50';
        expect((await refusal(log({ capturedLocation: metersNorth(90) }))).code).toBe('NOT_AT_LOCATION');
        kit.config.values.GEO_FENCE_RADIUS_METERS = '150';
        expect((await kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: metersNorth(90) }), tx)).data.geofence.status).toBe('PASS');
      });

      it('no registered location, no GPS reading and a weak reading are all refused too', async () => {
        kit.fmd.doctorLocation['d1'] = null;
        expect((await refusal(log())).message).toContain('no registered location');
        kit.fmd.doctorLocation['d1'] = CLINIC;
        expect((await refusal(kit.logDoctorCall.execute({ ...REC, clientId: 'c2' }, call({ capturedLocation: null, accuracyMeters: null }), tx))).message).toContain('GPS');
        expect((await refusal(kit.logDoctorCall.execute({ ...REC, clientId: 'c3' }, call({ accuracyMeters: 300 }), tx))).message).toContain('too weak');
        expect(kit.doctorCalls.rows).toHaveLength(0);
      });

      it('a geofence result sent by the phone is never taken', async () => {
        const err = await refusal(kit.logDoctorCall.execute(REC, { ...call({ capturedLocation: metersNorth(900) }), geofenceStatus: 'PASS' } as never, tx));
        expect(err.code).toBe('NOT_AT_LOCATION');
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
    it('is stored, checked against the Chemist’s stored location like a Doctor’s', async () => {
      const { data, serverId } = await kit.logChemistCall.execute(REC, chemistCall(), tx);
      expect(data.geofence).toMatchObject({ status: 'PASS' });
      expect(kit.chemistCalls.rows[0]).toMatchObject({ id: serverId, chemistId: 'c1', userId: 'mr1' });
      expect((await refusal(kit.logChemistCall.execute({ ...REC, clientId: 'c2' }, chemistCall({ capturedLocation: metersNorth(250) }), tx))).code).toBe('NOT_AT_LOCATION');
      expect((await refusal(kit.logChemistCall.execute({ ...REC, clientId: 'c3' }, chemistCall({ capturedLocation: null, accuracyMeters: null }), tx))).code).toBe('NOT_AT_LOCATION');
      expect(kit.chemistCalls.rows).toHaveLength(1);
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
    it('a Doctor follow-up and a Chemist follow-up are attached to the day’s DCR, with where the MR was', async () => {
      const d = await kit.logFollowup.execute(REC, followup('DOCTOR', 'd1'), tx);
      const c = await kit.logFollowup.execute({ ...REC, clientId: 'client-2' }, followup('CHEMIST', 'c1', { remarks: 'restock' }), tx);
      expect(kit.followups.rows.map((f) => [f.id, f.subject, f.remarks])).toEqual([[d.serverId, 'DOCTOR', 'call again Friday'], [c.serverId, 'CHEMIST', 'restock']]);
      expect(kit.followups.rows[0]).toMatchObject({ capturedLocation: CLINIC, geofence: { status: 'PASS' } });
      expect(kit.dcrs.rows).toHaveLength(1);
    });

    it('is refused away from the Doctor or Chemist, like a call, and nothing is stored', async () => {
      expect((await refusal(kit.logFollowup.execute(REC, followup('DOCTOR', 'd1', { capturedLocation: metersNorth(500) }), tx))).code).toBe('NOT_AT_LOCATION');
      expect((await refusal(kit.logFollowup.execute(REC, followup('CHEMIST', 'c1', { capturedLocation: null, accuracyMeters: null }), tx))).code).toBe('NOT_AT_LOCATION');
      expect(kit.followups.rows).toHaveLength(0);
    });

    it('is refused by the gate and by the same checks on who it is about', async () => {
      kit.fmd.assigned.delete('mr1:d1');
      expect((await refusal(kit.logFollowup.execute(REC, followup('DOCTOR', 'd1'), tx))).code).toBe('DOCTOR_NOT_ASSIGNED');
      kit.territory.routesByUser.set('mr1', []);
      expect((await refusal(kit.logFollowup.execute(REC, followup('CHEMIST', 'c1'), tx))).code).toBe('CHEMIST_ROUTE_NOT_ASSIGNED');
      kit.users.users.get('mr1')!.blocked = true;
      expect((await refusal(kit.logFollowup.execute(REC, followup('DOCTOR', 'd1'), tx))).code).toBe('USER_BLOCKED');
    });
  });
});
