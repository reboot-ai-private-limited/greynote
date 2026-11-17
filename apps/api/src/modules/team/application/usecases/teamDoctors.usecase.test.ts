import { beforeEach, describe, expect, it } from 'vitest';
import { FakeTeam } from './teamKit.js';
import { TeamDoctorUseCase, TeamMemberDoctorsUseCase } from './teamDoctors.usecase.js';

const doctor = (id: string, name: string, over = {}) => ({ id, name, specialty: 'GP', clinicName: null, phone: null, address: 'x', routeId: 'r1', visitFrequency: 2, status: 'active', ...over });
const svc = (id: string, doctorId: string, amountPaise: number, status: string, over = {}) => ({ id, doctorId, userId: 'mr1', userName: 'Asha', serviceType: 'GIFT', amountPaise, remarks: null, status, doneAt: null, createdAt: new Date('2026-11-10T00:00:00Z'), ...over });

describe('a manager reads a person’s doctors and a doctor', () => {
  let kit: FakeTeam;
  const clockless = undefined;
  void clockless;
  beforeEach(() => {
    kit = new FakeTeam();
    kit.held.set('mr1', [doctor('d1', 'Dr Rao'), doctor('d2', 'Dr Sen'), doctor('d3', 'Dr Old', { status: 'inactive' })]);
    kit.services = [svc('s1', 'd1', 450_000, 'APPROVED'), svc('s2', 'd1', 90_000, 'SUBMITTED'), svc('s3', 'd1', 30_000, 'REJECTED'), svc('s4', 'd1', 120_000, 'APPROVED', { doneAt: new Date('2026-11-12T00:00:00Z') })];
    kit.day.set('mr1|2026-11-16', { userId: 'mr1', date: '2026-11-16', reportStatus: 'APPROVED', doctorCalls: [{ doctorId: 'd1', recordedAt: new Date('2026-11-16T05:00:00Z'), remarks: 'ok', geofence: 'PASS' }], chemistCalls: [], followups: 0 });
    kit.day.set('mr1|2026-10-20', { userId: 'mr1', date: '2026-10-20', reportStatus: 'APPROVED', doctorCalls: [{ doctorId: 'd2', recordedAt: new Date('2026-10-20T05:00:00Z'), remarks: null, geofence: 'PASS' }], chemistCalls: [], followups: 0 });
  });

  it('lists the active doctors with this month’s visits, the last visit and the services (rejected ones are not summed)', async () => {
    const out = await new TeamMemberDoctorsUseCase(kit, kit, kit, kit).execute('rsm', 'mr1', '2026-11');
    expect(out.items.map((d) => d.name)).toEqual(['Dr Rao', 'Dr Sen']);
    expect(out.items[0]).toMatchObject({ visitsThisMonth: 1, lastVisit: '2026-11-16', routeName: 'Route r1' });
    expect(out.items[0]?.services).toEqual({ count: 4, totalPaise: 450_000 + 90_000 + 120_000, waiting: 1, toDo: 1, done: 1, rejected: 1 });
    expect(out.items[1]).toMatchObject({ visitsThisMonth: 0, lastVisit: '2026-10-20', services: { count: 0, totalPaise: 0 } });
  });

  it('one doctor in full, for the manager of the holder; anyone else gets a 404', async () => {
    const doc = new TeamDoctorUseCase(kit, kit, kit, kit);
    const out = await doc.execute('rsm', 'd1', '2026-11');
    expect(out).toMatchObject({ doctor: { name: 'Dr Rao' }, heldBy: { id: 'mr1' }, visitsThisMonth: 1 });
    expect(out.services.items).toHaveLength(4);
    kit.held.set('stranger', [doctor('d9', 'Dr Far')]);
    await expect(doc.execute('rsm', 'd9', '2026-11')).rejects.toMatchObject({ statusCode: 404 });
    await expect(doc.execute('rsm', 'nope', '2026-11')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('the person must be in the downline (403)', async () => {
    await expect(new TeamMemberDoctorsUseCase(kit, kit, kit, kit).execute('rsm', 'stranger', '2026-11')).rejects.toMatchObject({ statusCode: 403 });
  });
});
