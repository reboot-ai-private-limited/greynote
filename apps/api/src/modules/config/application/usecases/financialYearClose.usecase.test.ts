import { beforeEach, describe, expect, it } from 'vitest';
import type { SystemConfigEntry } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { FinancialYearClose } from './financialYearClose.usecase.js';

class FakeRepo implements SystemConfigRepositoryPort {
  values = new Map<string, string>([['BUSINESS_TIMEZONE', 'Asia/Kolkata'], ['FY_START_MONTH', 'APRIL'], ['FY_CLOSED_YEARS', 'NONE']]);
  writes: Array<[string, string, string]> = [];
  async findByKey(key: string) {
    const value = this.values.get(key);
    return value === undefined ? null : ({ key, value } as SystemConfigEntry);
  }
  async list() {
    return [];
  }
  async upsertSeed() {}
  async updateValue(key: string, value: string, by: string) {
    this.values.set(key, value);
    this.writes.push([key, value, by]);
    return { key, value } as SystemConfigEntry;
  }
}

// 6 October 2026 (IST): the financial year in progress is 2026-27.
const NOW = new Date('2026-10-06T06:00:00Z');

describe('closing a financial year', () => {
  let repo: FakeRepo;
  let fy: FinancialYearClose;
  const status = (p: Promise<unknown>) => p.then(() => 0, (e: { statusCode: number }) => e.statusCode);

  beforeEach(() => {
    repo = new FakeRepo();
    fy = new FinancialYearClose(repo, () => NOW);
  });

  it('shows the year in progress and the ended years that can be closed, newest first', async () => {
    expect(await fy.state('ADMIN')).toEqual({ currentYear: 2026, closedYears: [], closableYears: [2025, 2024, 2023, 2022, 2021] });
  });

  it('closes an ended year, records who, and drops it from what can be closed', async () => {
    const state = await fy.close('admin-1', 'ADMIN', 2025);
    expect(state.closedYears).toEqual([2025]);
    expect(state.closableYears).not.toContain(2025);
    expect(repo.writes).toEqual([['FY_CLOSED_YEARS', '2025', 'admin-1']]);
  });

  it('keeps the list sorted, whatever the order closed in', async () => {
    await fy.close('a', 'ADMIN', 2025);
    expect((await fy.close('a', 'ADMIN', 2024)).closedYears).toEqual([2024, 2025]);
  });

  it('refuses the year in progress and a future year, and a year already closed', async () => {
    expect(await status(fy.close('a', 'ADMIN', 2026))).toBe(400);
    expect(await status(fy.close('a', 'ADMIN', 2030))).toBe(400);
    await fy.close('a', 'ADMIN', 2025);
    expect(await status(fy.close('a', 'ADMIN', 2025))).toBe(409);
  });

  it('reopens a closed year, and refuses one that is not closed', async () => {
    await fy.close('a', 'ADMIN', 2025);
    await fy.close('a', 'ADMIN', 2024);
    expect((await fy.reopen('a', 'ADMIN', 2025)).closedYears).toEqual([2024]);
    expect(await status(fy.reopen('a', 'ADMIN', 2025))).toBe(409);
    expect((await fy.reopen('a', 'ADMIN', 2024)).closedYears).toEqual([]);
    expect(repo.values.get('FY_CLOSED_YEARS')).toBe('NONE');
  });

  it('is for Admin only', async () => {
    for (const role of ['HR', 'ACCOUNTANT', 'FIELD'] as const) {
      expect(await status(fy.state(role))).toBe(403);
      expect(await status(fy.close('a', role, 2025))).toBe(403);
      expect(await status(fy.reopen('a', role, 2025))).toBe(403);
    }
  });

  it('follows the start month: in January 2027 with a January start, 2026 has just ended', async () => {
    repo.values.set('FY_START_MONTH', 'JANUARY');
    fy = new FinancialYearClose(repo, () => new Date('2027-01-10T06:00:00Z'));
    expect((await fy.state('ADMIN')).currentYear).toBe(2027);
    expect((await fy.close('a', 'ADMIN', 2026)).closedYears).toEqual([2026]);
  });
});
