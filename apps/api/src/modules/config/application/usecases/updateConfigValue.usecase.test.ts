import { describe, expect, it } from 'vitest';
import type { SystemConfigEntry } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { UpdateConfigValueUseCase } from './updateConfigValue.usecase.js';

function makeEntry(overrides: Partial<SystemConfigEntry> = {}): SystemConfigEntry {
  return {
    key: 'DCR_MISS_GRACE_DAYS',
    value: '1',
    module: 'PLANNING',
    description: 'Consecutive missed days tolerated before the compliance block fires.',
    updatedBy: null,
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

class FakeSystemConfigRepository implements Pick<SystemConfigRepositoryPort, 'updateValue' | 'findByKey'> {
  updates: Array<{ key: string; value: string; updatedBy: string }> = [];
  /** Other settings the use case may read (the plan times check). */
  others = new Map<string, string>();
  constructor(private entry: SystemConfigEntry | null) {}
  async findByKey(key: string): Promise<SystemConfigEntry | null> {
    const value = this.others.get(key);
    return value === undefined ? null : makeEntry({ key, value });
  }
  async updateValue(key: string, value: string, updatedBy: string): Promise<SystemConfigEntry | null> {
    this.updates.push({ key, value, updatedBy });
    if (!this.entry) return null;
    this.entry = { ...this.entry, value, updatedBy, updatedAt: new Date() };
    return this.entry;
  }
}

describe('UpdateConfigValueUseCase', () => {
  it('rejects a non-Admin caller before touching the repository', async () => {
    const repository = new FakeSystemConfigRepository(makeEntry());
    const useCase = new UpdateConfigValueUseCase(repository as unknown as SystemConfigRepositoryPort);

    await expect(useCase.execute('user-1', 'HR', 'DCR_MISS_GRACE_DAYS', '2')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repository.updates).toHaveLength(0);
  });

  it('updates the value and stamps the acting Admin as updatedBy', async () => {
    const repository = new FakeSystemConfigRepository(makeEntry());
    const useCase = new UpdateConfigValueUseCase(repository as unknown as SystemConfigRepositoryPort);

    const result = await useCase.execute('admin-1', 'ADMIN', 'DCR_MISS_GRACE_DAYS', '2');

    expect(repository.updates).toEqual([{ key: 'DCR_MISS_GRACE_DAYS', value: '2', updatedBy: 'admin-1' }]);
    expect(result).toMatchObject({ key: 'DCR_MISS_GRACE_DAYS', value: '2', updatedBy: 'admin-1' });
  });

  it('rejects an unknown key with 404, not the internal CONFIG_KEY_MISSING path', async () => {
    const repository = new FakeSystemConfigRepository(null);
    const useCase = new UpdateConfigValueUseCase(repository as unknown as SystemConfigRepositoryPort);

    await expect(useCase.execute('admin-1', 'ADMIN', 'NOT_A_REAL_KEY', '2')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  const build = () => {
    const repository = new FakeSystemConfigRepository(makeEntry());
    return { repository, useCase: new UpdateConfigValueUseCase(repository as unknown as SystemConfigRepositoryPort) };
  };

  describe('validation', () => {
    it('refuses a value that breaks its setting’s rules with a 400 naming the rule, and stores nothing', async () => {
      const { repository, useCase } = build();
      await expect(useCase.execute('admin-1', 'ADMIN', 'DCR_MISS_GRACE_DAYS', 'banana')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Use a whole number from 0 to 365.',
      });
      await expect(useCase.execute('admin-1', 'ADMIN', 'DCR_MISS_GRACE_DAYS', '366')).rejects.toMatchObject({ statusCode: 400 });
      expect(repository.updates).toEqual([]);
    });

    it('refuses the values that would fail on every later read: a bad time, a month number, a made-up timezone', async () => {
      const { repository, useCase } = build();
      for (const [key, value] of [
        ['DAILY_PLAN_SUBMIT_CUTOFF_TIME', 'banana'],
        ['DAILY_PLAN_SUBMIT_CUTOFF_TIME', '9:05'],
        ['FY_START_MONTH', '13'],
        ['WEEKLY_OFF_DAY', 'APRIL'],
        ['BUSINESS_TIMEZONE', 'Mars/Olympus'],
        ['DCR_MISS_BLOCK_ENABLED', 'yes'],
        ['APPROVAL_MANAGER_ONLY_KINDS', 'NONE,LEAVE'],
      ] as const) {
        await expect(useCase.execute('admin-1', 'ADMIN', key, value), `${key}=${value}`).rejects.toMatchObject({ statusCode: 400 });
      }
      expect(repository.updates).toEqual([]);
    });

    it('stores the value in the form the readers expect, not as typed', async () => {
      const { repository, useCase } = build();
      await useCase.execute('admin-1', 'ADMIN', 'FY_START_MONTH', ' january ');
      await useCase.execute('admin-1', 'ADMIN', 'DCR_MISS_BLOCK_ENABLED', 'FALSE');
      await useCase.execute('admin-1', 'ADMIN', 'GEO_FENCE_RADIUS_METERS', ' 0150 ');
      await useCase.execute('admin-1', 'ADMIN', 'APPROVAL_MANAGER_ONLY_KINDS', 'daily_plan, leave');
      expect(repository.updates.map((u) => [u.key, u.value])).toEqual([
        ['FY_START_MONTH', 'JANUARY'],
        ['DCR_MISS_BLOCK_ENABLED', 'false'],
        ['GEO_FENCE_RADIUS_METERS', '150'],
        ['APPROVAL_MANAGER_ONLY_KINDS', 'DAILY_PLAN,LEAVE'],
      ]);
    });

    it('treats a key with no definition as unknown, even if a row exists for it', async () => {
      const { useCase } = build();
      await expect(useCase.execute('admin-1', 'ADMIN', 'SOMETHING_OLD', 'x')).rejects.toMatchObject({ statusCode: 404 });
    });

    it('checks the role before the value', async () => {
      const { useCase } = build();
      await expect(useCase.execute('hr-1', 'HR', 'DCR_MISS_GRACE_DAYS', 'banana')).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('the plan times stay in order', () => {
    it('refuses a latest resubmit time that is not after the plan deadline', async () => {
      const { repository, useCase } = build();
      repository.others.set('DAILY_PLAN_SUBMIT_CUTOFF_TIME', '10:00');
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_RESUBMIT_LATEST_TIME', '10:00')).rejects.toMatchObject({
        statusCode: 400,
        message: 'The latest resubmit time (10:00) must be after the plan deadline (10:00).',
      });
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_RESUBMIT_LATEST_TIME', '09:30')).rejects.toMatchObject({ statusCode: 400 });
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_RESUBMIT_LATEST_TIME', '10:01')).resolves.toBeDefined();
    });

    it('refuses a plan deadline that is not before the latest resubmit time', async () => {
      const { repository, useCase } = build();
      repository.others.set('DAILY_PLAN_RESUBMIT_LATEST_TIME', '11:30');
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_SUBMIT_CUTOFF_TIME', '12:00')).rejects.toMatchObject({
        statusCode: 400,
        message: 'The plan deadline (12:00) must be before the latest resubmit time (11:30).',
      });
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_SUBMIT_CUTOFF_TIME', '09:00')).resolves.toBeDefined();
    });

    it('does not let a bad older value in the other setting block fixing this one, and ignores unrelated settings', async () => {
      const { repository, useCase } = build();
      repository.others.set('DAILY_PLAN_SUBMIT_CUTOFF_TIME', 'banana');
      await expect(useCase.execute('a', 'ADMIN', 'DAILY_PLAN_RESUBMIT_LATEST_TIME', '11:30')).resolves.toBeDefined();
      await expect(useCase.execute('a', 'ADMIN', 'DCR_MISS_GRACE_DAYS', '2')).resolves.toBeDefined();
    });
  });
});
