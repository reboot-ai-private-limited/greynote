import { beforeEach, describe, expect, it } from 'vitest';
import type { DoctorCall, Followup } from '../domain/call.entity.js';
import { DoctorVisitGap } from './doctorVisitGap.js';
import { FakeConfig, FakeDoctorCalls, FakeFollowups } from './usecases/faTestKit.js';

describe('days between visits to a doctor (a sooner visit is an extra visit: kept, not counted)', () => {
  let config: FakeConfig;
  let calls: FakeDoctorCalls;
  let followups: FakeFollowups;
  let gap: DoctorVisitGap;
  const callOn = (reportDate: string, userId = 'mr1', doctorId = 'd1') => calls.rows.push({ id: `c-${calls.rows.length}`, userId, doctorId, reportDate } as unknown as DoctorCall);
  const followupOn = (reportDate: string, subject: 'DOCTOR' | 'CHEMIST' = 'DOCTOR', subjectId = 'd1') =>
    followups.rows.push({ id: `f-${followups.rows.length}`, userId: 'mr1', subject, subjectId, reportDate } as unknown as Followup);
  const check = (date: string, userId = 'mr1', doctorId = 'd1') => gap.check(userId, doctorId, date);
  const extra = async (date: string, userId?: string, doctorId?: string) => (await check(date, userId, doctorId)) !== null;

  beforeEach(() => {
    config = new FakeConfig();
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '8';
    calls = new FakeDoctorCalls();
    followups = new FakeFollowups();
    gap = new DoctorVisitGap(config, calls, followups);
  });

  it('with 8: a call on the 1st makes the 1st to the 8th extra and the 9th counted, so 4 counted visits fit in a month', async () => {
    callOn('2026-10-01');
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-08']) expect(await extra(day)).toBe(true);
    expect(await check('2026-10-09')).toBeNull();
    callOn('2026-10-09');
    callOn('2026-10-17');
    expect(await check('2026-10-25')).toBeNull();
  });

  it('an extra visit does not push the next counted one back', async () => {
    callOn('2026-10-01');
    calls.rows.push({ id: 'x', userId: 'mr1', doctorId: 'd1', reportDate: '2026-10-05', extraVisitAfter: '2026-10-01' } as unknown as DoctorCall);
    expect(await check('2026-10-09')).toBeNull();
  });

  it('says when the last visit was and when the next may be, as text and as details for the phone', async () => {
    callOn('2026-10-03');
    expect(await check('2026-10-06')).toEqual({
      lastVisit: '2026-10-03',
      nextAllowed: '2026-10-11',
      gapDays: 8,
      message: 'Extra visit: you visited this doctor on 3 Oct. It is saved, but not counted; the next counted visit can be from 11 Oct.',
    });
  });

  it('a follow-up is a visit too, both ways; a chemist follow-up is not', async () => {
    followupOn('2026-10-05');
    expect(await extra('2026-10-07')).toBe(true);
    followups.rows = [];
    followupOn('2026-10-05', 'CHEMIST', 'd1');
    await expect(check('2026-10-07')).resolves.toBeNull();
  });

  it('looks both ways, since an earlier day can reach the server after a later one', async () => {
    callOn('2026-10-10');
    const found = await check('2026-10-05');
    expect(found).toMatchObject({ lastVisit: '2026-10-10' });
    expect(found?.message).toBe('Extra visit: you have a counted visit to this doctor on 10 Oct, less than 8 days after this one. It is saved, but not counted.');
    await expect(check('2026-10-02')).resolves.toBeNull();
  });

  it('is per employee and per doctor: a manager’s joint visit, or another doctor, is not held back', async () => {
    callOn('2026-10-05');
    await expect(check('2026-10-05', 'asm')).resolves.toBeNull();
    await expect(check('2026-10-05', 'mr1', 'd2')).resolves.toBeNull();
  });

  it('0 turns it off, and a removed call no longer counts', async () => {
    callOn('2026-10-05');
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '0';
    await expect(check('2026-10-05')).resolves.toBeNull();
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '8';
    calls.rows = [];
    await expect(check('2026-10-06')).resolves.toBeNull();
  });
});
