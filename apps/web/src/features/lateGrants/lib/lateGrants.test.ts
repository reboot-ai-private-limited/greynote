import { describe, expect, it } from 'vitest';
import { buildBulkGrant, buildGrant, zonedToIso } from './lateGrants';

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
    periodKey: '2026-11',
    reason: ' Joined late ',
    expiresAt: '',
  };

  it('builds a request without expiresAt when none is picked', () => {
    expect(buildGrant(form, 'Asia/Kolkata', now)).toEqual({
      ok: true,
      body: { userId: 'u1', kind: 'MONTHLY_PLAN', periodKey: '2026-11', reason: 'Joined late' },
    });
  });
  it('sends the picked end as an instant', () => {
    const built = buildGrant({ ...form, expiresAt: '2026-10-29T18:30' }, 'Asia/Kolkata', now);
    expect(built).toMatchObject({ ok: true, body: { expiresAt: '2026-10-29T13:00:00.000Z' } });
  });
  it('flags a missing employee, reason, a month typed as a day, and a past end', () => {
    const built = buildGrant(
      { ...form, userId: '', reason: ' ', periodKey: '2026-11-05', expiresAt: '2026-10-01T10:00' },
      'UTC',
      now,
    );
    expect(built).toMatchObject({
      ok: false,
      errors: {
        userId: expect.any(String),
        reason: expect.any(String),
        periodKey: expect.any(String),
        expiresAt: expect.any(String),
      },
    });
  });
});

describe('buildGrant for the other kinds', () => {
  const now = new Date('2026-11-02T00:00:00Z');
  const base = { userId: 'u1', reason: 'x', expiresAt: '' };
  it('wants a date for a daily plan and a month for the rest', () => {
    expect(buildGrant({ ...base, kind: 'DAILY_PLAN', periodKey: '2026-11-02' }, 'UTC', now).ok).toBe(true);
    expect(buildGrant({ ...base, kind: 'DAILY_PLAN', periodKey: '2026-11' }, 'UTC', now).ok).toBe(false);
    expect(buildGrant({ ...base, kind: 'DCR_SUBMIT', periodKey: '2026-10-05' }, 'UTC', now).ok).toBe(true);
    expect(buildGrant({ ...base, kind: 'DCR_SUBMIT', periodKey: '2026-10' }, 'UTC', now).ok).toBe(false);
    for (const kind of ['EXPENSE_SUBMIT', 'EXPENSE_APPROVE', 'MONTHLY_STOCK', 'SECONDARY_SALES'] as const) {
      expect(buildGrant({ ...base, kind, periodKey: '2026-10' }, 'UTC', now).ok).toBe(true);
      expect(buildGrant({ ...base, kind, periodKey: '2026-10-05' }, 'UTC', now).ok).toBe(false);
    }
  });
});

describe('buildBulkGrant', () => {
  const now = new Date('2026-11-02T00:00:00Z');
  const form = { userIds: ['u1', 'u2', 'u1'], kind: 'MONTHLY_PLAN' as const, periodKey: '2026-10', reason: ' Outage ', expiresAt: '' };

  it('sends each employee once, with the same trimmed fields', () => {
    expect(buildBulkGrant(form, 'UTC', now)).toEqual({
      ok: true,
      body: { userIds: ['u1', 'u2'], kind: 'MONTHLY_PLAN', periodKey: '2026-10', reason: 'Outage' },
    });
  });
  it('wants at least one employee, and not more than the server takes', () => {
    expect(buildBulkGrant({ ...form, userIds: [] }, 'UTC', now)).toMatchObject({ ok: false, errors: { userIds: expect.any(String) } });
    const many = Array.from({ length: 501 }, (_, i) => `u${i}`);
    expect(buildBulkGrant({ ...form, userIds: many }, 'UTC', now)).toMatchObject({ ok: false, errors: { userIds: expect.any(String) } });
  });
  it('reports the shared fields’ problems together with a missing list', () => {
    expect(buildBulkGrant({ ...form, userIds: [], reason: '', periodKey: '' }, 'UTC', now)).toMatchObject({
      ok: false,
      errors: { userIds: expect.any(String), reason: expect.any(String), periodKey: expect.any(String) },
    });
  });
});
