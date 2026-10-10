import { describe, expect, it } from 'vitest';
import { CONFIG_DEFINITIONS, CONFIG_MODULE_LABEL, findConfigDefinition, validateConfigValue } from './configDefinitions.js';

/** What the seed wrote before the registry existed. A default changing by accident would change a live system's behaviour. */
const HISTORICAL_DEFAULTS: Record<string, string> = {
  DAILY_PLAN_SUBMIT_CUTOFF_TIME: '10:00',
  MONTHLY_PLAN_SUBMIT_CUTOFF_DATE: '28',
  BUSINESS_TIMEZONE: 'Asia/Kolkata',
  DAY_START_TIME: '00:00',
  FY_START_MONTH: 'APRIL',
  WEEKLY_OFF_DAY: 'SUNDAY',
  LEAVE_BACKDATE_DAYS: '30',
  LATE_PLAN_GRANT_BY_MANAGER: 'false',
  LATE_PLAN_GRANT_VALID_HOURS: '24',
  DAILY_PLAN_RESUBMIT_GRACE_MINUTES: '30',
  DAILY_PLAN_RESUBMIT_LATEST_TIME: '11:30',
  MONTHLY_PLAN_RESUBMIT_GRACE_HOURS: '24',
  PLAN_RESUBMIT_GRACE_MAX: '2',
  DOCTOR_VISIBILITY_FOLLOWS_ROUTE: 'true',
  AUTO_ASSIGN_DOCTOR_ON_APPROVAL: 'true',
  NEW_DOCTOR_COVERAGE_WAIT_DAYS: '8',
  DAILY_PLAN_CHANGE_MAX: '3',
  MAX_REGISTERED_DEVICES_FIELD: '2',
  REJECTED_DEVICE_TTL_DAYS: '7',
  GEO_FENCE_RADIUS_METERS: '100',
  GEO_MAX_ACCURACY_METERS: '100',
  SYNC_MAX_BATCH: '100',
  SYNC_DRAFT_TTL_DAYS: '30',
  SYNC_MAX_DRAFT_BYTES: '65536',
  SYNC_MAX_DRAFTS: '2000',
  SYNC_MAX_AGE_DAYS: '7',
  SYNC_CLOCK_SKEW_MINUTES: '10',
  DCR_MISS_BLOCK_ENABLED: 'true',
  DCR_APPROVAL_REQUIRED: 'true',
  APPROVAL_SLA_DAYS: '3',
  DCR_MISS_GRACE_DAYS: '1',
  MONTHLY_STOCK_DEADLINE_DAY: '5',
  APPROVAL_MANAGER_ONLY_KINDS: 'NONE',
  PROBATION_LEAVE_PAID: 'true',
  PROBATION_MONTHS: '6',
  EX_STATION_MIN_KM: '15',
  OUT_STATION_MIN_KM: '50',
  TA_MAX_KM: '99',
  CALL_CARRY_OVER_FOREVER: 'false',
  CALL_CARRY_OVER_DAYS: '0',
  SALARY_RUN_DAY: '1',
  EXPENSE_PAYOUT_DAY: '15',
  FY_CLOSED_YEARS: 'NONE',
  LEAVE_LOCKED_AFTER_PAYROLL: 'true',
  CTC_JUMP_WARN_PERCENT: '50',
  ABSENT_DEDUCTS_SALARY: 'true',
  STRIKE_DEDUCTS_SALARY: 'false',
};

const def = (key: string) => {
  const d = findConfigDefinition(key);
  if (!d) throw new Error(`no definition for ${key}`);
  return d;
};

describe('the definitions registry', () => {
  it('defines each of the seeded keys exactly once, with the default it always had', () => {
    expect(CONFIG_DEFINITIONS).toHaveLength(Object.keys(HISTORICAL_DEFAULTS).length);
    expect(new Set(CONFIG_DEFINITIONS.map((d) => d.key)).size).toBe(CONFIG_DEFINITIONS.length);
    for (const [key, value] of Object.entries(HISTORICAL_DEFAULTS)) expect(def(key).default, key).toBe(value);
  });

  it('gives every default a value its own rules accept, unchanged', () => {
    for (const d of CONFIG_DEFINITIONS) expect(validateConfigValue(d, d.default), d.key).toEqual({ ok: true, value: d.default });
  });

  it('describes every setting, with a label and a module the screen can group by', () => {
    for (const d of CONFIG_DEFINITIONS) {
      expect(d.label.length, d.key).toBeGreaterThan(0);
      expect(d.description.length, d.key).toBeGreaterThan(0);
      expect(CONFIG_MODULE_LABEL[d.module], `${d.key}: ${d.module}`).toBeDefined();
    }
  });

  it('gives every whole-number setting sane limits with its default inside them', () => {
    for (const d of CONFIG_DEFINITIONS.filter((x) => x.type === 'INTEGER')) {
      expect(d.min, d.key).toBeDefined();
      expect(d.max, d.key).toBeDefined();
      expect(d.min!, d.key).toBeLessThanOrEqual(Number(d.default));
      expect(Number(d.default), d.key).toBeLessThanOrEqual(d.max!);
    }
  });

  it('says what moves for every high-impact setting', () => {
    const high = CONFIG_DEFINITIONS.filter((d) => d.impact === 'HIGH');
    expect(high.map((d) => d.key).sort()).toEqual(['APPROVAL_MANAGER_ONLY_KINDS', 'BUSINESS_TIMEZONE', 'DAY_START_TIME', 'DCR_APPROVAL_REQUIRED', 'DCR_MISS_BLOCK_ENABLED', 'FY_START_MONTH', 'WEEKLY_OFF_DAY']);
    for (const d of high) expect(d.impactNote?.length, d.key).toBeGreaterThan(20);
  });
});

describe('validateConfigValue', () => {
  it('accepts true and false in any case, and refuses anything else', () => {
    const d = def('DCR_MISS_BLOCK_ENABLED');
    expect(validateConfigValue(d, ' TRUE ')).toEqual({ ok: true, value: 'true' });
    expect(validateConfigValue(d, 'false')).toEqual({ ok: true, value: 'false' });
    for (const bad of ['yes', '1', '', 'tru']) expect(validateConfigValue(d, bad).ok, bad).toBe(false);
  });

  it('holds a whole number to its limits, ends included, and says what they are', () => {
    const radius = def('GEO_FENCE_RADIUS_METERS');
    expect(validateConfigValue(radius, '1')).toEqual({ ok: true, value: '1' });
    expect(validateConfigValue(radius, '100000')).toEqual({ ok: true, value: '100000' });
    expect(validateConfigValue(radius, ' 0150 ')).toEqual({ ok: true, value: '150' });
    for (const bad of ['0', '100001', '-5', '1.5', 'ten', '', '1e3']) expect(validateConfigValue(radius, bad), bad).toMatchObject({ ok: false, message: 'Use a whole number from 1 to 100000.' });
  });

  it('allows zero where the reader does, and refuses it where it does not', () => {
    expect(validateConfigValue(def('DCR_MISS_GRACE_DAYS'), '0')).toEqual({ ok: true, value: '0' });
    expect(validateConfigValue(def('PLAN_RESUBMIT_GRACE_MAX'), '0').ok).toBe(true);
    expect(validateConfigValue(def('PLAN_RESUBMIT_GRACE_MAX'), '100').ok).toBe(false);
    expect(validateConfigValue(def('MAX_REGISTERED_DEVICES_FIELD'), '0').ok).toBe(false);
    expect(validateConfigValue(def('MONTHLY_PLAN_SUBMIT_CUTOFF_DATE'), '32').ok).toBe(false);
    expect(validateConfigValue(def('MONTHLY_STOCK_DEADLINE_DAY'), '0').ok).toBe(false);
    expect(validateConfigValue(def('MONTHLY_STOCK_DEADLINE_DAY'), '29').ok).toBe(false);
  });

  it('reads a time exactly as the system does: HH:MM, 24-hour, two digits each', () => {
    const d = def('DAILY_PLAN_SUBMIT_CUTOFF_TIME');
    expect(validateConfigValue(d, ' 09:05 ')).toEqual({ ok: true, value: '09:05' });
    expect(validateConfigValue(d, '23:59')).toEqual({ ok: true, value: '23:59' });
    // `9:05` is refused because the deadline code refuses it; accepting it here would store a value that then fails on every read.
    for (const bad of ['9:05', '24:00', '10:60', '10', '10am', 'banana', '']) expect(validateConfigValue(d, bad).ok, bad).toBe(false);
  });

  it('accepts a month and a weekday by name in any case, and refuses a number or a misspelling', () => {
    expect(validateConfigValue(def('FY_START_MONTH'), 'january')).toEqual({ ok: true, value: 'JANUARY' });
    expect(validateConfigValue(def('WEEKLY_OFF_DAY'), ' friday ')).toEqual({ ok: true, value: 'FRIDAY' });
    for (const bad of ['13', 'Aprl', 'APRIL 1', '']) expect(validateConfigValue(def('FY_START_MONTH'), bad).ok, bad).toBe(false);
    expect(validateConfigValue(def('WEEKLY_OFF_DAY'), 'APRIL').ok).toBe(false);
  });

  it('accepts a real timezone as typed, fixes the casing of a canonical one, and refuses a made-up one', () => {
    const d = def('BUSINESS_TIMEZONE');
    // The default must survive untouched even though Intl calls this zone "Asia/Calcutta".
    expect(validateConfigValue(d, 'Asia/Kolkata')).toEqual({ ok: true, value: 'Asia/Kolkata' });
    expect(validateConfigValue(d, ' europe/london ')).toEqual({ ok: true, value: 'Europe/London' });
    expect(validateConfigValue(d, 'UTC').ok).toBe(true);
    for (const bad of ['Mars/Olympus', 'IST+5', '', 'banana']) expect(validateConfigValue(d, bad).ok, bad).toBe(false);
  });

  it('accepts NONE or a list of kinds, normalised, and refuses a mix or a malformed name', () => {
    const d = def('APPROVAL_MANAGER_ONLY_KINDS');
    expect(validateConfigValue(d, ' none ')).toEqual({ ok: true, value: 'NONE' });
    expect(validateConfigValue(d, 'daily_plan, leave ,daily_plan')).toEqual({ ok: true, value: 'DAILY_PLAN,LEAVE' });
    expect(validateConfigValue(d, 'NONE,LEAVE').ok).toBe(false);
    for (const bad of ['', ',', 'daily plan', '9LEAVE', 'LEAVE;DCR']) expect(validateConfigValue(d, bad).ok, bad).toBe(false);
    expect(validateConfigValue(d, Array.from({ length: 21 }, (_, i) => `K${i}`).join(',')).ok).toBe(false);
  });
});
