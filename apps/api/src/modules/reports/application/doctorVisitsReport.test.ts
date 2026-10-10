import { describe, expect, it } from 'vitest';
import type { DoctorCallsPort, FieldRosterPort, MasterPort, PlannedDoctorsPort } from '../domain/ports.js';
import { DoctorVisitsReport } from './doctorVisitsReport.js';

const emp = (id: string, name: string) => ({ id, name, employeeCode: `E-${id}`, designation: null, hqId: null, zoneId: null });
const EMPLOYEES = [emp('mr1', 'Asha'), emp('mr2', 'Bala'), emp('boss', 'Chitra')];
const DOWNLINE: Record<string, string[]> = { boss: ['mr1', 'mr2'] };

const roster: FieldRosterPort = {
  listFieldEmployees: async (only) => EMPLOYEES.filter((e) => !only || only.includes(e.id)),
  getDownline: async (id) => (DOWNLINE[id] ?? []).map((x) => ({ id: x })),
};
const doctors: Record<string, Array<{ id: string; name: string; specialty: string; visitFrequency: number | null }>> = {
  mr1: [
    { id: 'd1', name: 'Dr A', specialty: 'ENT', visitFrequency: 4 },
    { id: 'd2', name: 'Dr B', specialty: 'ENT', visitFrequency: 2 },
    { id: 'd3', name: 'Dr C', specialty: 'ENT', visitFrequency: null },
  ],
  mr2: [{ id: 'd4', name: 'Dr D', specialty: 'ENT', visitFrequency: 1 }],
};
const master = { listAssignedDoctors: async (id: string) => doctors[id] ?? [] } as unknown as MasterPort;
const fieldActivity: DoctorCallsPort = { countDoctorCalls: async () => [{ doctorId: 'd1', count: 1 }, { doctorId: 'd2', count: 5 }, { doctorId: 'd3', count: 3 }] };
const planning: PlannedDoctorsPort = { listPlannedDoctors: async (id) => (id === 'mr1' ? [{ doctorId: 'd1', plannedDays: 2, missedSince: '2026-10-05' }] : []) };
const report = new DoctorVisitsReport(roster, master, fieldActivity, planning);

describe('DoctorVisitsReport', () => {
  it('counts quota, made and missed; only doctors with a frequency; made is capped per doctor', async () => {
    const r = await report.month({ actor: { id: 'admin', role: 'ADMIN' }, month: '2026-10', userId: 'mr1' });
    const mr = r.mrs[0]!;
    expect(mr).toMatchObject({ quota: 6, made: 3, missed: 3, doctors: 2, completedDoctors: 1 });
    expect(mr.rows[0]).toMatchObject({ frequency: 4, made: 1, missed: 3 });
    expect(mr.rows[0]).toMatchObject({ plannedDays: 2, missedSince: '2026-10-05' });
    expect(mr.rows[1]).toMatchObject({ plannedDays: 0, missedSince: null });
    expect(r.totals).toMatchObject({ quota: 6, made: 3, missed: 3 });
  });

  it('Admin without userId sees every employee that has tracked doctors, most missed first', async () => {
    const r = await report.month({ actor: { id: 'admin', role: 'ADMIN' }, month: '2026-10' });
    expect(r.mrs.map((m) => m.mr.id)).toEqual(['mr1', 'mr2']);
    expect(r.totals.quota).toBe(7);
  });

  it('a manager sees their downline; an MR only themself', async () => {
    expect((await report.month({ actor: { id: 'boss', role: 'FIELD' }, month: '2026-10' })).mrs).toHaveLength(2);
    await expect(report.month({ actor: { id: 'mr1', role: 'FIELD' }, month: '2026-10', userId: 'mr2' })).rejects.toMatchObject({ statusCode: 403 });
    expect((await report.month({ actor: { id: 'mr1', role: 'FIELD' }, month: '2026-10' })).mrs.map((m) => m.mr.id)).toEqual(['mr1']);
  });

  it('other roles are refused', async () => {
    await expect(report.month({ actor: { id: 'h', role: 'HR' }, month: '2026-10' })).rejects.toMatchObject({ statusCode: 403 });
  });
});
