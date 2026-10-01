import { describe, expect, it } from 'vitest';
import { capLabel, cardsForRole, comingSoonForRole, longestWaiting, sumPaise } from './dashboard';

describe('capLabel', () => {
  it('shows the count under the cap', () => expect(capLabel(42, 500)).toBe('42'));
  it('shows "500+" at the cap, because the true figure is unknown', () => {
    expect(capLabel(500, 500)).toBe('500+');
  });
});

describe('sumPaise', () => {
  it('adds integer paise', () => expect(sumPaise([{ amountPaise: 150 }, { amountPaise: 275 }])).toBe(425));
  it('is zero for none', () => expect(sumPaise([])).toBe(0));
});

describe('longestWaiting', () => {
  it('returns the oldest first and does not mutate the input', () => {
    const items = [{ t: '2026-10-03' }, { t: '2026-10-01' }, { t: '2026-10-02' }];
    expect(longestWaiting(items, (i) => i.t, 2).map((i) => i.t)).toEqual(['2026-10-01', '2026-10-02']);
    expect(items[0]?.t).toBe('2026-10-03');
  });
});

describe('cardsForRole', () => {
  it('gives ADMIN the devices queue and ACCOUNTANT neither it nor the inbox', () => {
    expect(cardsForRole('ADMIN')).toContain('devices');
    expect(cardsForRole('ACCOUNTANT')).not.toContain('devices');
    expect(cardsForRole('ACCOUNTANT')).not.toContain('approvals');
  });

  it('never shows HR the monthly-stock card (the API 403s it)', () => {
    expect(cardsForRole('HR')).not.toContain('missingStock');
  });

  it('keeps every dashboard to six cards or fewer', () => {
    for (const role of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) {
      expect(cardsForRole(role).length + comingSoonForRole(role).length).toBeLessThanOrEqual(6);
    }
  });

  it('shows FIELD nothing — they are not portal users', () => {
    expect(cardsForRole('FIELD')).toEqual([]);
  });
});
