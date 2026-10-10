import { beforeEach, describe, expect, it } from 'vitest';
import { SyncRejection } from '@/modules/sync/sync.public.js';
import { DoctorViews } from '../application/doctorViews.js';
import { makeNewDoctorSyncHandler, NEW_DOCTOR_SYNC_KIND } from '../application/newDoctorSync.js';
import { AddedDoctors } from '../application/usecases/addedDoctors.js';
import { FakeApprovals, FakeAssignments, FakeDoctors, FakeTerritory, FakeTransactions, FakeUsers, FakeSpecialties } from '../application/usecases/fmdTestKit.js';
import { editAddedDoctorBodySchema } from './field-master-data.schemas.js';
import { SpecialtyCatalog } from '../application/specialtyCatalog.js';

const ROUTE = 'a'.repeat(24);
const OTHER_ROUTE = 'b'.repeat(24);
const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const payload = (over: Record<string, unknown> = {}): Record<string, unknown> & { routeId: string; name: string; address: string; specialty: string; qualification: string; location: { latitude: number; longitude: number } } => ({
  routeId: ROUTE,
  name: 'Dr Mehta',
  address: '9 Lake Rd',
  specialty: 'ENT',
  qualification: 'MS',
  location: { latitude: 26.71, longitude: 88.41 },
  ...over,
});

describe('NEW_DOCTOR through the sync push', () => {
  let doctors: FakeDoctors;
  let approvals: FakeApprovals;
  let territory: FakeTerritory;
  let added: AddedDoctors;
  let handler: ReturnType<typeof makeNewDoctorSyncHandler>;
  const ctx = {};
  const run = (p: unknown, mr = 'mr1', clientId = CLIENT_ID) => handler.apply({ userId: mr, clientId, clientCreatedAt: new Date(), payload: p }, ctx);
  const refusal = async (p: unknown, mr = 'mr1') => {
    const err = await run(p, mr).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SyncRejection);
    return err as SyncRejection;
  };

  beforeEach(() => {
    const assignments = new FakeAssignments();
    doctors = new FakeDoctors(assignments);
    approvals = new FakeApprovals();
    territory = new FakeTerritory();
    territory.userRoutes.set('mr1', [ROUTE]);
    added = new AddedDoctors(doctors, territory, approvals, new FakeTransactions(), new DoctorViews(assignments, new FakeUsers()), new SpecialtyCatalog(new FakeSpecialties(['ENT', 'Cardiologist'])));
    handler = makeNewDoctorSyncHandler(added, (p) => editAddedDoctorBodySchema.parse(p));
  });

  it('is the NEW_DOCTOR kind', () => {
    expect(handler.kind).toBe(NEW_DOCTOR_SYNC_KIND);
    expect(NEW_DOCTOR_SYNC_KIND).toBe('NEW_DOCTOR');
  });

  it('creates the Doctor pending, with the phone’s location, and sends it for approval — the same as POST /doctors/added', async () => {
    const { serverId } = await run(payload());
    const doctor = doctors.rows.find((d) => d.id === serverId)!;
    expect(doctor).toMatchObject({
      name: 'Dr Mehta',
      status: 'pending',
      addedBy: 'mr1',
      approvedAt: null,
      location: { latitude: 26.71, longitude: 88.41 },
      capturedLocation: { latitude: 26.71, longitude: 88.41 },
      email: null,
    });
    expect(approvals.requests).toHaveLength(1);
    expect(approvals.requests[0]).toMatchObject({ kind: 'NEW_DOCTOR', recordId: serverId, submitterId: 'mr1', status: 'SUBMITTED' });
  });

  it('the sync client id becomes the Doctor’s clientRequestId, so the same id can never make two', async () => {
    const first = await run(payload());
    expect(doctors.rows[0]!.clientRequestId).toBe(CLIENT_ID);
    const again = await run(payload({ name: 'Renamed on the phone' }));
    expect(again.serverId).toBe(first.serverId);
    expect(doctors.rows).toHaveLength(1);
    expect(approvals.requests).toHaveLength(1);
  });

  it('a Doctor already added under that id through POST /doctors/added is returned, not duplicated', async () => {
    const direct = await added.add('mr1', { ...payload(), email: null, clientRequestId: CLIENT_ID });
    const { serverId } = await run(payload());
    expect(serverId).toBe(direct.doctor.id);
    expect(doctors.rows).toHaveLength(1);
  });

  it('a different MR’s record with the same client id is their own Doctor', async () => {
    territory.userRoutes.set('mr2', [ROUTE]);
    const a = await run(payload(), 'mr1');
    const b = await run(payload(), 'mr2');
    expect(a.serverId).not.toBe(b.serverId);
    expect(doctors.rows).toHaveLength(2);
  });

  describe('refusals (the record is FAILED, the rest of the day carries on)', () => {
    it('master-data drift: the MR no longer has the Route → ROUTE_NOT_ASSIGNED, nothing created', async () => {
      territory.userRoutes.set('mr1', [OTHER_ROUTE]); // Admin took ROUTE away while the phone was offline
      const r = await refusal(payload());
      expect(r.code).toBe('ROUTE_NOT_ASSIGNED');
      expect(r.message).toContain('route');
      expect(doctors.rows).toHaveLength(0);
      expect(approvals.requests).toHaveLength(0);
    });

    it('a payload that isn’t a Doctor → INVALID_PAYLOAD naming the first problem, with no parser internals', async () => {
      for (const bad of [null, 'text', 42, {}, payload({ name: '' }), payload({ routeId: 'not-an-id' }), payload({ location: undefined }), payload({ location: { latitude: 91, longitude: 0 } }), payload({ email: 'nope' })]) {
        const r = await refusal(bad);
        expect(r.code).toBe('INVALID_PAYLOAD');
        expect(r.message).not.toMatch(/ZodError|invalid_type|at path/i);
      }
      const named = await refusal(payload({ name: '' }));
      expect(named.message).toMatch(/^name:/);
      expect(doctors.rows).toHaveLength(0);
    });

    it('a simultaneous send that got in first → ADDED_AT_THE_SAME_TIME (the MR taps Submit again)', async () => {
      // The other request's row lands between this one's look and its insert.
      const realFind = doctors.findByClientRequest.bind(doctors);
      let calls = 0;
      doctors.findByClientRequest = async (...args) => {
        calls += 1;
        const found = await realFind(...args);
        if (calls === 1) await doctors.createProposed({ routeId: ROUTE, name: 'Dr Mehta', address: 'x', email: null, specialty: 'ENT', qualification: 'MS', location: null, dateOfBirth: null, anniversary: null, visitFrequency: null, capturedLocation: null, clientRequestId: CLIENT_ID, status: 'pending', addedBy: 'mr1', approvedAt: null });
        return found;
      };
      expect((await refusal(payload())).code).toBe('ADDED_AT_THE_SAME_TIME');
      // and on the retry the earlier one is simply returned
      doctors.findByClientRequest = realFind;
      expect((await run(payload())).serverId).toBe(doctors.rows[0]!.id);
      expect(doctors.rows).toHaveLength(1);
    });
  });
});
