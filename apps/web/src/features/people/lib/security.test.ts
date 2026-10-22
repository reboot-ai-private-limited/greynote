import { describe, expect, it } from 'vitest';
import { buildDeactivation, deactivateBlock, deactivationLines, resetPasswordError } from './security';

describe('resetPasswordError', () => {
  it('asks for a password, then applies the same rule as creation', () => {
    expect(resetPasswordError('')).toBe('Enter a new password.');
    expect(resetPasswordError('short')).toMatch(/at least 8/);
    expect(resetPasswordError('long-enough-1')).toBeUndefined();
    expect(resetPasswordError('é'.repeat(37))).toMatch(/72 bytes/);
  });
});

describe('deactivateBlock', () => {
  it('refuses your own account', () => {
    expect(deactivateBlock({ id: 'me', status: 'active' }, 'me')).toBe('self');
  });
  it('refuses an account that is already inactive', () => {
    expect(deactivateBlock({ id: 'u1', status: 'inactive' }, 'me')).toBe('already');
  });
  it('allows anyone else, whether active or still onboarding', () => {
    expect(deactivateBlock({ id: 'u1', status: 'active' }, 'me')).toBeNull();
    expect(deactivateBlock({ id: 'u1', status: 'pending' }, 'me')).toBeNull();
  });
  it('says self first when both apply', () => {
    expect(deactivateBlock({ id: 'me', status: 'inactive' }, 'me')).toBe('self');
  });
});

describe('buildDeactivation', () => {
  const impact = {
    today: '2026-10-22',
    user: { id: 'asm', name: 'Asha', employeeCode: 'GHC007', role: 'FIELD', status: 'active', lastWorkingDay: null },
    directReports: [{ id: 'mr1', name: 'Mona', employeeCode: 'GHC010' }],
  };
  const ok = { lastWorkingDay: '2026-10-20', newManagerId: 'rsm', doctorHandoverTo: '', typedCode: ' ghc007 ' };

  it('sends the day, the new manager and a hand-over only when chosen', () => {
    expect(buildDeactivation(ok, impact)).toEqual({ ok: true, body: { lastWorkingDay: '2026-10-20', newManagerId: 'rsm' } });
    expect(buildDeactivation({ ...ok, doctorHandoverTo: 'mr1' }, impact)).toMatchObject({ body: { doctorHandoverTo: 'mr1' } });
  });

  it('needs a past or today last day, a new manager for a team, and the code typed', () => {
    expect(buildDeactivation({ ...ok, lastWorkingDay: '2026-10-23' }, impact)).toMatchObject({ ok: false, errors: { lastWorkingDay: expect.any(String) } });
    expect(buildDeactivation({ ...ok, newManagerId: '' }, impact)).toMatchObject({ ok: false, errors: { newManagerId: 'Choose who the team reports to now.' } });
    expect(buildDeactivation({ ...ok, newManagerId: '' }, { ...impact, directReports: [] }).ok).toBe(true);
    expect(buildDeactivation({ ...ok, typedCode: 'GHC008' }, impact)).toMatchObject({ ok: false, errors: { typedCode: 'Type GHC007 to confirm.' } });
  });
});

describe('deactivationLines', () => {
  it('lists only what applies', () => {
    const work = { routes: 3, coverage: 0, doctors: 1, distributors: 0, plansAfter: 2, leavesAfter: 0, targetsAfter: 1, waitingOnThem: 4 };
    const lines = deactivationLines({ today: '2026-10-22', user: {} as never, suggestedManager: null, directReports: [{ id: 'mr1', name: 'M', employeeCode: 'C' }], work });
    expect(lines).toEqual([
      '1 person reporting to them moves to the new manager, with 4 requests waiting for a decision',
      '1 doctor: handed over where the new person has the route, the rest left unassigned',
      '3 routes ended',
      '2 plans after the last working day closed',
      '1 target running past the leaving month cut at that month',
    ]);
  });
});

