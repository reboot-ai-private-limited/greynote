import { describe, expect, it } from 'vitest';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { GetPublicConfigUseCase } from './getPublicConfig.usecase.js';

const build = (stored: Record<string, string>) =>
  new GetPublicConfigUseCase({ findByKey: async (key: string) => (key in stored ? { key, value: stored[key]! } : null) } as unknown as SystemConfigRepositoryPort);

describe('GetPublicConfigUseCase', () => {
  it('gives the start month as a number and the timezone as stored', async () => {
    expect(await build({ FY_START_MONTH: 'JANUARY', BUSINESS_TIMEZONE: 'Europe/London' }).execute()).toEqual({ financialYearStartMonth: 1, businessTimezone: 'Europe/London', dayStartTime: '00:00', closedFinancialYears: [] });
    expect(await build({ FY_START_MONTH: 'DECEMBER', BUSINESS_TIMEZONE: 'Asia/Kolkata' }).execute()).toMatchObject({ financialYearStartMonth: 12 });
  });

  it('falls back to the defaults, April and Asia/Kolkata, when nothing is stored', async () => {
    expect(await build({}).execute()).toEqual({ financialYearStartMonth: 4, businessTimezone: 'Asia/Kolkata', dayStartTime: '00:00', closedFinancialYears: [] });
  });

  it('falls back to the default for a stored value that breaks its own rules, so a client still gets an answer', async () => {
    expect(await build({ FY_START_MONTH: '13', BUSINESS_TIMEZONE: 'Mars/Olympus' }).execute()).toEqual({ financialYearStartMonth: 4, businessTimezone: 'Asia/Kolkata', dayStartTime: '00:00', closedFinancialYears: [] });
    // Only the spelling is off, but the server's own readers compare exactly, so it is not a value to trust.
    expect(await build({ FY_START_MONTH: 'january' }).execute()).toMatchObject({ financialYearStartMonth: 4 });
  });

  it('gives the day start as stored, and midnight when it breaks its rules', async () => {
    expect(await build({ DAY_START_TIME: '02:00' }).execute()).toMatchObject({ dayStartTime: '02:00' });
    expect(await build({ DAY_START_TIME: '2am' }).execute()).toMatchObject({ dayStartTime: '00:00', closedFinancialYears: [] });
  });

  it('exposes only those three settings', async () => {
    expect(Object.keys(await build({ DCR_MISS_GRACE_DAYS: '9' }).execute()).sort()).toEqual(['businessTimezone', 'closedFinancialYears', 'dayStartTime', 'financialYearStartMonth']);
  });
});
