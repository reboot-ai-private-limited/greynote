import { describe, expect, it } from 'vitest';
import { CONFIG_DEFINITIONS } from '../../domain/configDefinitions.js';
import type { SystemConfigEntry } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { ListConfigUseCase } from './listConfig.usecase.js';

const at = new Date('2026-10-01T00:00:00Z');
const seeded = (): SystemConfigEntry[] =>
  CONFIG_DEFINITIONS.map((d) => ({ key: d.key, value: d.default, module: d.module, description: d.description, updatedBy: null, updatedAt: at }));

const build = (rows: SystemConfigEntry[]) => new ListConfigUseCase({ list: async () => rows } as unknown as SystemConfigRepositoryPort);
const withValue = (rows: SystemConfigEntry[], key: string, value: string, updatedBy: string | null = 'admin-1') =>
  rows.map((r) => (r.key === key ? { ...r, value, updatedBy } : r));

describe('ListConfigUseCase', () => {
  it('refuses anyone but Admin', async () => {
    for (const role of ['HR', 'ACCOUNTANT', 'FIELD'] as const) await expect(build(seeded()).execute(role)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('lists every defined setting in the registry’s order, with its rules beside its value', async () => {
    const list = await build(seeded()).execute('ADMIN');
    expect(list.map((s) => s.key)).toEqual(CONFIG_DEFINITIONS.map((d) => d.key));
    const radius = list.find((s) => s.key === 'GEO_FENCE_RADIUS_METERS')!;
    expect(radius).toMatchObject({ type: 'INTEGER', min: 1, max: 100000, unit: 'meters', moduleLabel: 'Field activity and compliance', impact: 'NORMAL', impactNote: null, options: null });
  });

  it('marks a setting still at its default, and one an Admin changed with who changed it', async () => {
    const list = await build(withValue(seeded(), 'GEO_FENCE_RADIUS_METERS', '150')).execute('ADMIN');
    const changed = list.find((s) => s.key === 'GEO_FENCE_RADIUS_METERS')!;
    expect(changed).toMatchObject({ value: '150', default: '100', isDefault: false, valid: true, updatedBy: 'admin-1' });
    expect(list.find((s) => s.key === 'SYNC_MAX_BATCH')).toMatchObject({ isDefault: true, updatedBy: null });
  });

  it('gives a month and a weekday setting their names to choose from, and a high-impact one its warning', async () => {
    const list = await build(seeded()).execute('ADMIN');
    expect(list.find((s) => s.key === 'FY_START_MONTH')).toMatchObject({ options: expect.arrayContaining(['JANUARY', 'DECEMBER']), impact: 'HIGH', impactNote: expect.stringMatching(/boundary of the financial year/) });
    expect(list.find((s) => s.key === 'WEEKLY_OFF_DAY')?.options).toHaveLength(7);
  });

  it('flags a stored value that breaks its own rules, with the reason, instead of hiding it', async () => {
    const rows = withValue(withValue(withValue(seeded(), 'DAILY_PLAN_SUBMIT_CUTOFF_TIME', 'banana'), 'FY_START_MONTH', 'april'), 'GEO_FENCE_RADIUS_METERS', '0');
    const list = await build(rows).execute('ADMIN');
    expect(list.find((s) => s.key === 'DAILY_PLAN_SUBMIT_CUTOFF_TIME')).toMatchObject({ valid: false, invalidReason: 'Use a time as HH:MM, 24-hour, e.g. 10:00.', value: 'banana' });
    expect(list.find((s) => s.key === 'GEO_FENCE_RADIUS_METERS')).toMatchObject({ valid: false, invalidReason: 'Use a whole number from 1 to 100000.' });
    // Only the spelling is off, but the readers compare exactly, so it is a fault too.
    expect(list.find((s) => s.key === 'FY_START_MONTH')).toMatchObject({ valid: false, invalidReason: 'Stored as "april", but the system reads it as "APRIL".' });
    expect(list.filter((s) => !s.valid)).toHaveLength(3);
  });

  it('leaves out a stored row nobody defined, and a defined setting with no row', async () => {
    const rows = seeded().filter((r) => r.key !== 'SYNC_MAX_BATCH');
    rows.push({ key: 'SOMETHING_OLD', value: 'x', module: 'SYSTEM', description: 'old', updatedBy: null, updatedAt: at });
    const keys = (await build(rows).execute('ADMIN')).map((s) => s.key);
    expect(keys).not.toContain('SOMETHING_OLD');
    expect(keys).not.toContain('SYNC_MAX_BATCH');
    expect(keys).toHaveLength(CONFIG_DEFINITIONS.length - 1);
  });
});
