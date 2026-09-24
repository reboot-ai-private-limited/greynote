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

class FakeSystemConfigRepository implements Pick<SystemConfigRepositoryPort, 'updateValue'> {
  updates: Array<{ key: string; value: string; updatedBy: string }> = [];
  constructor(private entry: SystemConfigEntry | null) {}
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
});
