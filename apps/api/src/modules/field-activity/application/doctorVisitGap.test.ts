import { beforeEach, describe, expect, it } from 'vitest';
import type { DoctorCall, Followup } from '../domain/call.entity.js';
import { LOG_CODES, type LogRefusal } from '../domain/logRefusal.js';
import { DoctorVisitGap } from './doctorVisitGap.js';
import { FakeConfig, FakeDoctorCalls, FakeFollowups } from './usecases/faTestKit.js';

describe('days between visits to a doctor', () => {
  let config: FakeConfig;
  let calls: FakeDoctorCalls;
  let followups: FakeFollowups;
  let gap: DoctorVisitGap;
  const callOn = (reportDate: string, userId = 'mr1', doctorId = 'd1') => calls.rows.push({ id: `c-${calls.rows.length}`, userId, doctorId, reportDate } as unknown as DoctorCall);
  const followupOn = (reportDate: string, subject: 'DOCTOR' | 'CHEMIST' = 'DOCTOR', subjectId = 'd1') =>
    followups.rows.push({ id: `f-${followups.rows.length}`, userId: 'mr1', subject, subjectId, reportDate } as unknown as Followup);
  const check = (date: string, userId = 'mr1', doctorId = 'd1') => gap.assertAllowed(userId, doctorId, date);
  const refusal = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as LogRefusal);

  beforeEach(() => {
    config = new FakeConfig();
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '8';
    calls = new FakeDoctorCalls();
    followups = new FakeFollowups();
    gap = new DoctorVisitGap(config, calls, followups);
  });

  it('with 8: a call on the 1st refuses the 1st to the 8th and allows the 9th, so 4 visits fit in a month', async () => {
    callOn('2026-10-01');
    for (const day of ['2026-10-01', '2026-10-02', '2026-10-08']) expect((await refusal(check(day)))?.code).toBe(LOG_CODES.doctorVisitTooSoon);
    await expect(check('2026-10-09')).resolves.toBeUndefined();
    callOn('2026-10-09');
    callOn('2026-10-17');
    await expect(check('2026-10-25')).resolves.toBeUndefined();
  });

  it('says when the last visit was and when the next may be, as text and as details for the phone', async () => {
    callOn('2026-10-03');
    const err = await refusal(check('2026-10-06'));
    expect(err).toMatchObject({
      code: 'DOCTOR_VISIT_TOO_SOON',
      message: 'You visited this doctor on 3 Oct. The next visit can be from 11 Oct (8 days apart).',
      details: { lastVisit: '2026-10-03', nextAllowed: '2026-10-11', gapDays: '8' },
    });
  });

  it('a follow-up is a visit too, both ways; a chemist follow-up is not', async () => {
    followupOn('2026-10-05');
    expect((await refusal(check('2026-10-07')))?.code).toBe(LOG_CODES.doctorVisitTooSoon);
    followups.rows = [];
    followupOn('2026-10-05', 'CHEMIST', 'd1');
    await expect(check('2026-10-07')).resolves.toBeUndefined();
  });

  it('looks both ways, since an earlier day can reach the server after a later one', async () => {
    callOn('2026-10-10');
    const err = await refusal(check('2026-10-05'));
    expect(err).toMatchObject({ code: 'DOCTOR_VISIT_TOO_SOON', details: { lastVisit: '2026-10-10' } });
    expect(err?.message).toBe('You already have a visit to this doctor on 10 Oct, less than 8 days after this one.');
    await expect(check('2026-10-02')).resolves.toBeUndefined();
  });

  it('is per employee and per doctor: a manager’s joint visit, or another doctor, is not held back', async () => {
    callOn('2026-10-05');
    await expect(check('2026-10-05', 'asm')).resolves.toBeUndefined();
    await expect(check('2026-10-05', 'mr1', 'd2')).resolves.toBeUndefined();
  });

  it('0 turns it off, and a removed call no longer counts', async () => {
    callOn('2026-10-05');
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '0';
    await expect(check('2026-10-05')).resolves.toBeUndefined();
    config.values['DOCTOR_VISIT_GAP_DAYS'] = '8';
    calls.rows = [];
    await expect(check('2026-10-06')).resolves.toBeUndefined();
  });
});
