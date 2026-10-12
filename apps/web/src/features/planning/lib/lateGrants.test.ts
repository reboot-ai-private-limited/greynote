import { describe, expect, it } from 'vitest';
import { buildGrant, zonedToIso } from './lateGrants';

describe('zonedToIso', () => {
  it('reads the time in the business zone, not the browser’s', () => {
    expect(zonedToIso('2026-10-29T18:30', 'Asia/Kolkata')).toBe('2026-10-29T13:00:00.000Z');
    expect(zonedToIso('2026-10-29T18:30', 'UTC')).toBe('2026-10-29T18:30:00.000Z');
  });
  it('rejects text that is not a date and time', () => {
    expect(zonedToIso('2026-10-29', 'UTC')).toBeNull();
    expect(zonedToIso('', 'UTC')).toBeNull();
  });
});

describe('buildGrant', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  const form = {
    userId: 'u1',
    kind: 'MONTHLY_PLAN' as const,
    planKey: '2026-11',
    reason: ' Joined late ',
    expiresAt: '',
  };

  it('builds a request without expiresAt when none is picked', () => {
    expect(buildGrant(form, 'Asia/Kolkata', now)).toEqual({
      ok: true,
      body: { userId: 'u1', kind: 'MONTHLY_PLAN', planKey: '2026-11', reason: 'Joined late' },
    });
  });
  it('sends the picked end as an instant', () => {
    const built = buildGrant({ ...form, expiresAt: '2026-10-29T18:30' }, 'Asia/Kolkata', now);
    expect(built).toMatchObject({ ok: true, body: { expiresAt: '2026-10-29T13:00:00.000Z' } });
  });
  it('flags a missing employee, reason, a month typed as a day, and a past end', () => {
    const built = buildGrant(
      { ...form, userId: '', reason: ' ', planKey: '2026-11-05', expiresAt: '2026-10-01T10:00' },
      'UTC',
      now,
    );
    expect(built).toMatchObject({
      ok: false,
      errors: {
        userId: expect.any(String),
        reason: expect.any(String),
        planKey: expect.any(String),
        expiresAt: expect.any(String),
      },
    });
  });
});
