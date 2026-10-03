import type { HolidayDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_HOLIDAY, appliesTo, buildHoliday, groupByMonth, rangeError, toggleId, withScope } from './holidays';

const base = { name: ' Durga   Puja ', date: '2026-10-20' };

describe('buildHoliday', () => {
  it('builds a national holiday with no places', () => {
    expect(buildHoliday({ ...base, scope: 'NATIONAL', zoneIds: ['z1'], hqIds: ['h1'] })).toEqual({
      ok: true,
      body: { name: 'Durga Puja', date: '2026-10-20', scope: 'NATIONAL', zoneIds: [], hqIds: [] },
    });
  });
  it('needs a zone for a zone holiday, and an HQ for an HQ one', () => {
    expect(buildHoliday({ ...base, scope: 'ZONE', zoneIds: [], hqIds: [] })).toMatchObject({ ok: false, errors: { zoneIds: 'Choose at least one zone.' } });
    expect(buildHoliday({ ...base, scope: 'HQ', zoneIds: [], hqIds: [] })).toMatchObject({ ok: false, errors: { hqIds: 'Choose at least one HQ.' } });
  });
  it('sends only the ids of the chosen scope, de-duplicated', () => {
    expect(buildHoliday({ ...base, scope: 'ZONE', zoneIds: ['z1', 'z1', 'z2'], hqIds: ['h9'] })).toMatchObject({
      body: { zoneIds: ['z1', 'z2'], hqIds: [] },
    });
  });
  it('reports every missing field, and refuses a date that does not exist', () => {
    const result = buildHoliday(EMPTY_HOLIDAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['date', 'name', 'scope']);
    expect(buildHoliday({ ...base, date: '2026-02-30', scope: 'NATIONAL', zoneIds: [], hqIds: [] })).toMatchObject({ ok: false, errors: { date: 'Enter a real date.' } });
  });
});

describe('withScope / toggleId', () => {
  it('drops the places of the scope left behind', () => {
    const draft = { ...EMPTY_HOLIDAY, scope: 'ZONE' as const, zoneIds: ['z1'], hqIds: [] };
    expect(withScope(draft, 'HQ')).toMatchObject({ scope: 'HQ', zoneIds: [], hqIds: [] });
    expect(withScope(draft, 'ZONE').zoneIds).toEqual(['z1']);
  });
  it('adds and removes an id', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('rangeError', () => {
  it('accepts a range of at most 400 days, ends included', () => {
    expect(rangeError('2026-04-01', '2027-03-31')).toBeUndefined();
    expect(rangeError('2026-01-01', '2027-02-05')).toBeUndefined(); // exactly 400 days
  });
  it('refuses a reversed range, a missing end and a range over 400 days', () => {
    expect(rangeError('2026-05-01', '2026-04-01')).toBe('The end date is before the start date.');
    expect(rangeError('2026-04-01', '')).toBe('Choose both dates.');
    expect(rangeError('2026-01-01', '2027-02-06')).toBe('Choose at most 400 days at a time.');
  });
});

describe('groupByMonth / appliesTo', () => {
  const h = (id: string, date: string, name = id): HolidayDto => ({ id, name, date, scope: 'NATIONAL', zoneIds: [], hqIds: [], createdBy: '', createdAt: '' });
  it('groups by month in date order, and by name on the same day', () => {
    const groups = groupByMonth([h('b', '2026-11-01'), h('a2', '2026-10-20', 'B'), h('a1', '2026-10-20', 'A'), h('c', '2026-10-02')]);
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2026-11']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['c', 'a1', 'a2']);
  });
  it('says who it applies to', () => {
    const zone = (id: string) => ({ z1: 'West Bengal', z2: 'Assam' })[id] ?? '—';
    const hq = (id: string) => ({ h1: 'Siliguri' })[id] ?? '—';
    expect(appliesTo({ scope: 'NATIONAL', zoneIds: [], hqIds: [] }, zone, hq)).toBe('All employees');
    expect(appliesTo({ scope: 'ZONE', zoneIds: ['z1', 'z2'], hqIds: [] }, zone, hq)).toBe('Zone: West Bengal, Assam');
    expect(appliesTo({ scope: 'HQ', zoneIds: [], hqIds: ['h1'] }, zone, hq)).toBe('HQ: Siliguri');
  });
});
