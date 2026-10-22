import { beforeEach, describe, expect, it } from 'vitest';
import type { PlanDay } from '../../domain/plan.js';
import { DoctorReleases } from '../doctorReleases.js';
import { Clock, planningKit } from './planningTestKit.js';

const MR1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const MR2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';
const DR = 'cccccccccccccccccccccccc';
const OTHER = 'cccccccccccccccccccccccd';
const field: PlanDay = { workingType: 'FIELD_WORK', dayKind: 'NORMAL', workWith: [], routeIds: ['bbbbbbbbbbbbbbbbbbbbbbb1'], remarks: null };

describe('Daily Plans when a doctor leaves', () => {
  let kit: ReturnType<typeof planningKit>;
  let releases: DoctorReleases;

  /** A plan for the day listing these doctors, optionally already submitted. */
  const plan = async (userId: string, date: string, doctorIds: string[], submitted = false) => {
    const saved = await kit.dailyPlans.save(userId, date, field, null);
    const withDoctors = await kit.dailyPlans.saveDoctors(saved!.id, saved!.revision, doctorIds.map((doctorId) => ({ doctorId, carriedFrom: null })));
    if (submitted) await kit.approvals.submit({ kind: 'DAILY_PLAN', recordId: saved!.id, submitterId: userId });
    return withDoctors!;
  };
  const doctorsOf = async (userId: string, date: string) => (await kit.dailyPlans.findByUserAndDate(userId, date))!.doctors.map((d) => d.doctorId);

  beforeEach(() => {
    kit = planningKit(new Clock(new Date('2026-10-10T05:00:00Z')));
    releases = new DoctorReleases(kit.dailyPlans, kit.approvals, kit.deadlines);
  });

  it('counts the plans from today that list the doctor, editable apart from submitted', async () => {
    await plan(MR1, '2026-10-09', [DR]); // yesterday: not counted
    await plan(MR1, '2026-10-10', [DR, OTHER]);
    await plan(MR1, '2026-10-11', [DR], true);
    await plan(MR2, '2026-10-12', [DR]);
    await plan(MR2, '2026-10-13', [OTHER]);
    expect(await releases.count(DR)).toEqual({ editable: 2, locked: 1 });
  });

  it('takes it off one employee’s editable plans from today, leaving past and submitted plans and other people alone', async () => {
    await plan(MR1, '2026-10-09', [DR]);
    await plan(MR1, '2026-10-10', [DR, OTHER]);
    await plan(MR1, '2026-10-11', [DR], true);
    await plan(MR2, '2026-10-12', [DR]);
    expect(await releases.release(DR, MR1)).toBe(1);
    expect(await doctorsOf(MR1, '2026-10-10')).toEqual([OTHER]);
    expect(await doctorsOf(MR1, '2026-10-09')).toEqual([DR]);
    expect(await doctorsOf(MR1, '2026-10-11')).toEqual([DR]);
    expect(await doctorsOf(MR2, '2026-10-12')).toEqual([DR]);
  });

  it('takes it off everyone’s editable plans when the doctor itself goes', async () => {
    await plan(MR1, '2026-10-10', [DR]);
    await plan(MR2, '2026-10-12', [DR, OTHER]);
    expect(await releases.release(DR, null)).toBe(2);
    expect(await doctorsOf(MR1, '2026-10-10')).toEqual([]);
    expect(await doctorsOf(MR2, '2026-10-12')).toEqual([OTHER]);
  });

  it('a plan that came back for changes is editable again, so it is cleaned', async () => {
    const p = await plan(MR1, '2026-10-10', [DR], true);
    await kit.approvals.decide('DAILY_PLAN', p.id, 'REJECTED');
    expect(await releases.release(DR, MR1)).toBe(1);
    expect(await doctorsOf(MR1, '2026-10-10')).toEqual([]);
  });
});
