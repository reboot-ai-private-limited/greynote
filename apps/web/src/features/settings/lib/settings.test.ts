import type { ConfigSettingDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  canSave,
  confirmCopy,
  displayValue,
  draftError,
  groupSettings,
  invalidSettings,
  isChanged,
  isDefaultDraft,
  normalizeDraft,
  rangeHint,
  searchSettings,
} from './settings';

const setting = (over: Partial<ConfigSettingDto> = {}): ConfigSettingDto => ({
  key: 'GEO_FENCE_RADIUS_METERS',
  module: 'FIELD_ACTIVITY',
  moduleLabel: 'Field activity and compliance',
  label: 'Geofence radius',
  description: 'Radius, in meters, a Dr/Chemist Call must be logged within.',
  type: 'INTEGER',
  min: 1,
  max: 100000,
  unit: 'meters',
  options: null,
  default: '100',
  impact: 'NORMAL',
  impactNote: null,
  value: '100',
  isDefault: true,
  valid: true,
  invalidReason: null,
  updatedBy: null,
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});
const month = setting({ key: 'FY_START_MONTH', module: 'SYSTEM', moduleLabel: 'System', label: 'Financial year starts in', type: 'MONTH', min: null, max: null, unit: null, options: ['JANUARY', 'APRIL', 'DECEMBER'], default: 'APRIL', value: 'APRIL', impact: 'HIGH', impactNote: 'Moves the boundary of the financial year.' });

describe('groupSettings / searchSettings', () => {
  const list = [setting(), setting({ key: 'SYNC_MAX_BATCH', module: 'SYNC', moduleLabel: 'Phone sync', label: 'Most records per push', description: 'Most records the app may send in one push.' }), setting({ key: 'GEO_MAX_ACCURACY_METERS', label: 'Least accurate GPS reading trusted', description: 'A reading less accurate than this cannot confirm a call.' })];
  it('groups by module, keeping the server’s order within and between groups', () => {
    const groups = groupSettings(list);
    expect(groups.map((g) => [g.module, g.items.map((i) => i.key)])).toEqual([
      ['FIELD_ACTIVITY', ['GEO_FENCE_RADIUS_METERS', 'GEO_MAX_ACCURACY_METERS']],
      ['SYNC', ['SYNC_MAX_BATCH']],
    ]);
    expect(groups[1]?.label).toBe('Phone sync');
  });
  it('searches the name, description, key and group without regard to case', () => {
    expect(searchSettings(list, 'radius').map((s) => s.key)).toEqual(['GEO_FENCE_RADIUS_METERS']);
    expect(searchSettings(list, 'PHONE SYNC').map((s) => s.key)).toEqual(['SYNC_MAX_BATCH']);
    expect(searchSettings(list, 'sync_max').length).toBe(1);
    expect(searchSettings(list, '  ').length).toBe(3);
    expect(searchSettings(list, 'nothing like this')).toEqual([]);
  });
  it('counts the stored values that break their own rules', () => {
    expect(invalidSettings([setting(), setting({ valid: false })])).toBe(1);
  });
});

describe('displayValue / rangeHint', () => {
  it('shows a value as a person reads it', () => {
    expect(displayValue(setting(), '100')).toBe('100 meters');
    expect(displayValue(setting({ unit: null }), '65536')).toBe('65,536');
    expect(displayValue(setting({ type: 'BOOLEAN' }), 'true')).toBe('On');
    expect(displayValue(setting({ type: 'BOOLEAN' }), 'false')).toBe('Off');
    expect(displayValue(month, 'JANUARY')).toBe('January');
    expect(displayValue(setting({ type: 'KIND_LIST' }), 'NONE')).toBe('None');
    expect(displayValue(setting({ type: 'KIND_LIST' }), 'DAILY_PLAN,LEAVE')).toBe('DAILY_PLAN, LEAVE');
    expect(displayValue(setting({ type: 'TIME' }), '10:00')).toBe('10:00');
  });
  it('says what a value may be', () => {
    expect(rangeHint(setting())).toBe('1 to 1,00,000 meters');
    expect(rangeHint(setting({ type: 'TIME' }))).toMatch(/HH:MM/);
    expect(rangeHint(setting({ type: 'BOOLEAN' }))).toBe('On or off');
  });
});

describe('draftError mirrors the server', () => {
  it('holds a whole number to its limits, ends included', () => {
    expect(draftError(setting(), '1')).toBeUndefined();
    expect(draftError(setting(), ' 100000 ')).toBeUndefined();
    for (const bad of ['0', '100001', '-5', '1.5', 'ten', '', '1e3']) expect(draftError(setting(), bad), bad).toBe('Use a whole number from 1 to 1,00,000.');
  });
  it('reads a time exactly as the system does', () => {
    const t = setting({ type: 'TIME' });
    expect(draftError(t, '09:05')).toBeUndefined();
    for (const bad of ['9:05', '24:00', '10:60', '10am', '']) expect(draftError(t, bad), bad).toBeDefined();
  });
  it('needs a month or weekday from the list, in any case', () => {
    expect(draftError(month, 'january')).toBeUndefined();
    expect(draftError(month, 'FEBRUARY')).toBeDefined();
    expect(draftError(month, '4')).toBeDefined();
  });
  it('needs on or off for a switch', () => {
    expect(draftError(setting({ type: 'BOOLEAN' }), 'true')).toBeUndefined();
    expect(draftError(setting({ type: 'BOOLEAN' }), 'yes')).toBeDefined();
  });
  it('accepts a real timezone and refuses a made-up one', () => {
    const tz = setting({ type: 'TIMEZONE' });
    expect(draftError(tz, 'Asia/Kolkata')).toBeUndefined();
    expect(draftError(tz, 'UTC')).toBeUndefined();
    for (const bad of ['Mars/Olympus', '', 'banana']) expect(draftError(tz, bad), bad).toBeDefined();
  });
  it('accepts NONE or a list of kinds, and refuses a mix or a malformed name', () => {
    const k = setting({ type: 'KIND_LIST' });
    expect(draftError(k, 'none')).toBeUndefined();
    expect(draftError(k, 'daily_plan, leave')).toBeUndefined();
    for (const bad of ['', ',', 'daily plan', 'NONE,LEAVE', '9LEAVE']) expect(draftError(k, bad), bad).toBeDefined();
    expect(draftError(k, Array.from({ length: 21 }, (_, i) => `K${i}`).join(','))).toBe('At most 20 kinds.');
  });
});

describe('normalizeDraft / isChanged / canSave', () => {
  it('writes a value the way the server stores it', () => {
    expect(normalizeDraft('MONTH', ' january ')).toBe('JANUARY');
    expect(normalizeDraft('INTEGER', ' 0150 ')).toBe('150');
    expect(normalizeDraft('BOOLEAN', 'TRUE')).toBe('true');
    expect(normalizeDraft('KIND_LIST', 'daily_plan, leave ,daily_plan')).toBe('DAILY_PLAN,LEAVE');
    expect(normalizeDraft('KIND_LIST', ' none ')).toBe('NONE');
    expect(normalizeDraft('TIME', ' 09:05 ')).toBe('09:05');
  });
  it('has nothing to save for a draft equal to what is stored once normalised', () => {
    expect(isChanged(setting(), '100')).toBe(false);
    expect(isChanged(setting(), ' 0100 ')).toBe(false);
    expect(isChanged(setting(), '150')).toBe(true);
    expect(isChanged(month, 'april')).toBe(false);
  });
  it('can save only a valid change', () => {
    expect(canSave(setting(), '150')).toBe(true);
    expect(canSave(setting(), '100')).toBe(false);
    expect(canSave(setting(), 'banana')).toBe(false);
  });
  it('recognises a draft that is the default', () => {
    expect(isDefaultDraft(setting(), ' 100 ')).toBe(true);
    expect(isDefaultDraft(setting(), '150')).toBe(false);
  });
});

describe('confirmCopy', () => {
  it('is nothing for an ordinary setting, which just saves', () => {
    expect(confirmCopy(setting(), '150')).toBeNull();
  });
  it('names the change and what it moves for a high-impact setting', () => {
    expect(confirmCopy(month, 'january')).toEqual({
      title: 'Change financial year starts in?',
      note: 'Moves the boundary of the financial year.',
      change: 'April → January',
      confirm: 'Change it',
    });
  });
});
