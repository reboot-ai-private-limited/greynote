import type { HolidayDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_HOLIDAY, appliesTo, buildHoliday, dateSpan, groupByMonth, holidayDays, rangeError, toggleId, withScope } from './holidays';

const base = { name: ' Durga   Puja ', date: '2026-10-20', endDate: '' };

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

describe('buildHoliday: a range of days', () => {
  const national = { ...base, scope: 'NATIONAL' as const, zoneIds: [], hqIds: [] };
  it('sends endDate only when it is after the first day', () => {
    expect(buildHoliday({ ...national, date: '2026-10-02', endDate: '2026-10-08' })).toMatchObject({ ok: true, body: { date: '2026-10-02', endDate: '2026-10-08' } });
    const same = buildHoliday({ ...national, date: '2026-10-02', endDate: '2026-10-02' });
    expect(same.ok && 'endDate' in same.body).toBe(false);
  });
  it('refuses a last day before the first, a fake date, or more than 31 days', () => {
    expect(buildHoliday({ ...national, date: '2026-10-08', endDate: '2026-10-02' })).toMatchObject({ ok: false, errors: { endDate: 'The last day is before the first day.' } });
    expect(buildHoliday({ ...national, endDate: '2026-02-30' })).toMatchObject({ ok: false, errors: { endDate: 'Enter a real date.' } });
    expect(buildHoliday({ ...national, date: '2026-10-01', endDate: '2026-11-01' })).toMatchObject({ ok: false, errors: { endDate: 'A holiday can run at most 31 days.' } });
    expect(buildHoliday({ ...national, date: '2026-10-01', endDate: '2026-10-31' }).ok).toBe(true);
  });
  it('counts the days, both ends included, across a month end', () => {
    expect(holidayDays('2026-10-02', '2026-10-08')).toBe(7);
    expect(holidayDays('2026-10-30', '2026-11-02')).toBe(4);
    expect(holidayDays('2026-10-08', '2026-10-02')).toBeNull();
    expect(holidayDays('2026-10-08', '')).toBeNull();
  });
  it('shows a span of dates', () => {
    expect(dateSpan('2026-10-02', '2026-10-02')).toBe('2 Oct 2026');
    expect(dateSpan('2026-10-02', '2026-10-08')).toBe('2 Oct – 8 Oct 2026');
    expect(dateSpan('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
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
  const h = (id: string, date: string, name = id, groupId: string | null = null): HolidayDto => ({ id, name, date, scope: 'NATIONAL', zoneIds: [], hqIds: [], groupId, createdBy: '', createdAt: '' });
  it('groups by month in date order, and by name on the same day', () => {
    const groups = groupByMonth([h('b', '2026-11-01'), h('a2', '2026-10-20', 'B'), h('a1', '2026-10-20', 'A'), h('c', '2026-10-02')]);
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2026-11']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['c', 'a1', 'a2']);
  });
  it('shows the days of a range as one entry, under the month it starts in', () => {
    const puja = ['2026-10-31', '2026-11-01', '2026-11-02'].map((d, i) => h(`p${i}`, d, 'Puja', 'g1'));
    const groups = groupByMonth([puja[2]!, h('x', '2026-11-01', 'Other'), puja[0]!, puja[1]!]);
    expect(groups.map((g) => g.month)).toEqual(['2026-10', '2026-11']);
    expect(groups[0]?.items).toEqual([expect.objectContaining({ id: 'p0', name: 'Puja', from: '2026-10-31', to: '2026-11-02', days: 3, groupId: 'g1' })]);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['x']);
  });
  it('says who it applies to', () => {
    const zone = (id: string) => ({ z1: 'West Bengal', z2: 'Assam' })[id] ?? '—';
    const hq = (id: string) => ({ h1: 'Siliguri' })[id] ?? '—';
    expect(appliesTo({ scope: 'NATIONAL', zoneIds: [], hqIds: [] }, zone, hq)).toBe('All employees');
    expect(appliesTo({ scope: 'ZONE', zoneIds: ['z1', 'z2'], hqIds: [] }, zone, hq)).toBe('Zone: West Bengal, Assam');
    expect(appliesTo({ scope: 'HQ', zoneIds: [], hqIds: ['h1'] }, zone, hq)).toBe('HQ: Siliguri');
  });
});
