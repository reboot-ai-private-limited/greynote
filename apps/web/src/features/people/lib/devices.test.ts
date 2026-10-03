import { describe, expect, it } from 'vitest';
import { actionsFor, confirmCopy, orderDevices, slotsInUse } from './devices';

describe('actionsFor', () => {
  it('lets a pending phone be approved or rejected', () => {
    expect(actionsFor({ status: 'PENDING', loggedIn: false })).toEqual(['approve', 'reject']);
  });
  it('lets a registered phone be removed, and logged out only while signed in', () => {
    expect(actionsFor({ status: 'REGISTERED', loggedIn: true })).toEqual(['logout', 'remove']);
    expect(actionsFor({ status: 'REGISTERED', loggedIn: false })).toEqual(['remove']);
  });
  it('offers nothing for a rejected or removed phone', () => {
    expect(actionsFor({ status: 'REJECTED', loggedIn: false })).toEqual([]);
    expect(actionsFor({ status: 'REMOVED', loggedIn: false })).toEqual([]);
  });
});

describe('slotsInUse', () => {
  it('counts pending and registered, not rejected or removed', () => {
    expect(slotsInUse([{ status: 'PENDING' }, { status: 'REGISTERED' }, { status: 'REJECTED' }, { status: 'REMOVED' }])).toBe(2);
    expect(slotsInUse([])).toBe(0);
  });
});

describe('orderDevices', () => {
  it('puts live phones first and each group newest first', () => {
    const rows = [
      { id: 'removed', status: 'REMOVED' as const, requestedAt: '2026-09-30T00:00:00Z' },
      { id: 'reg-old', status: 'REGISTERED' as const, requestedAt: '2026-09-01T00:00:00Z' },
      { id: 'pending', status: 'PENDING' as const, requestedAt: '2026-10-02T00:00:00Z' },
      { id: 'reg-new', status: 'REGISTERED' as const, requestedAt: '2026-09-20T00:00:00Z' },
      { id: 'rejected', status: 'REJECTED' as const, requestedAt: '2026-10-01T00:00:00Z' },
    ];
    expect(orderDevices(rows).map((r) => r.id)).toEqual(['pending', 'reg-new', 'reg-old', 'rejected', 'removed']);
  });
  it('does not change the list it is given', () => {
    const rows = [
      { status: 'REMOVED' as const, requestedAt: 'b' },
      { status: 'PENDING' as const, requestedAt: 'a' },
    ];
    orderDevices(rows);
    expect(rows[0]?.status).toBe('REMOVED');
  });
});

describe('confirmCopy', () => {
  it('names the device and says what happens', () => {
    expect(confirmCopy('remove', 'Redmi Note 11').description).toMatch(/Redmi Note 11.*frees a device slot/);
    expect(confirmCopy('logout', 'Pixel').description).toMatch(/stays registered/);
  });
  it('is a primary action to approve and a danger action for the rest', () => {
    expect(confirmCopy('approve', 'x').tone).toBe('primary');
    for (const a of ['reject', 'remove', 'logout'] as const) expect(confirmCopy(a, 'x').tone).toBe('danger');
  });
});
