import { describe, expect, it } from 'vitest';
import { CONFIG_DEFINITIONS } from '../../domain/configDefinitions.js';
import type { SystemConfigEntry, SystemConfigSeed } from '../../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../../domain/systemConfig.repository.port.js';
import { DEFAULT_CONFIG, SeedDefaultConfigUseCase } from './seedDefaultConfig.usecase.js';
import { ListConfigUseCase } from './listConfig.usecase.js';

class Repo implements SystemConfigRepositoryPort {
  rows = new Map<string, SystemConfigEntry>();
  async findByKey(key: string) {
    return this.rows.get(key) ?? null;
  }
  async list() {
    return [...this.rows.values()];
  }
  async upsertSeed(entries: SystemConfigSeed[]) {
    const added: string[] = [];
    for (const e of entries) {
      if (this.rows.has(e.key)) continue;
      this.rows.set(e.key, { ...e, updatedBy: null, updatedAt: new Date() } as SystemConfigEntry);
      added.push(e.key);
    }
    return added;
  }
  async updateValue(key: string, value: string, updatedBy: string) {
    const r = this.rows.get(key);
    if (!r) return null;
    const next = { ...r, value, updatedBy } as SystemConfigEntry;
    this.rows.set(key, next);
    return next;
  }
}

describe('topping up the settings', () => {
  it('has a seed row for every defined setting', () => {
    expect(DEFAULT_CONFIG.map((d) => d.key).sort()).toEqual(CONFIG_DEFINITIONS.map((d) => d.key).sort());
  });

  it('adds only the missing ones, never rewrites a stored value, and a second run adds nothing', async () => {
    const repo = new Repo();
    const seed = new SeedDefaultConfigUseCase(repo);
    // a database seeded before the late-grant and chemist settings existed, with one value an Admin changed
    for (const d of CONFIG_DEFINITIONS.filter((x) => !['DCR_SUBMIT_CUTOFF_DAY', 'MANAGER_CAN_ADD_CHEMISTS', 'LATE_STOCK_GRANT_BY_MANAGER'].includes(x.key))) {
      repo.rows.set(d.key, { key: d.key, value: d.default, module: d.module, description: d.description, updatedBy: null, updatedAt: new Date() } as SystemConfigEntry);
    }
    await repo.updateValue('TA_MAX_KM', '120', 'admin1');
    expect((await seed.execute()).sort()).toEqual(['DCR_SUBMIT_CUTOFF_DAY', 'LATE_STOCK_GRANT_BY_MANAGER', 'MANAGER_CAN_ADD_CHEMISTS']);
    expect((await repo.findByKey('TA_MAX_KM'))!.value).toBe('120');
    expect(await seed.execute()).toEqual([]);
  });

  it('then the Admin list shows every listable setting, the ones that were missing included', async () => {
    const repo = new Repo();
    const list = new ListConfigUseCase(repo);
    expect((await list.execute('ADMIN')).map((s) => s.key)).not.toContain('DCR_SUBMIT_CUTOFF_DAY');
    await new SeedDefaultConfigUseCase(repo).execute();
    const keys = (await list.execute('ADMIN')).map((s) => s.key);
    for (const k of ['MANAGER_CAN_ADD_CHEMISTS', 'DCR_SUBMIT_CUTOFF_DAY', 'LATE_DCR_GRANT_VALID_HOURS', 'LATE_DCR_GRANT_MAX_HOURS', 'LATE_STOCK_GRANT_BY_MANAGER', 'LATE_STOCK_GRANT_VALID_HOURS', 'LATE_STOCK_GRANT_MAX_HOURS']) expect(keys).toContain(k);
    expect(keys.length).toBe(CONFIG_DEFINITIONS.filter((d) => !d.managedBy).length);
  });
});
