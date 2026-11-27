import { describe, expect, it } from 'vitest';
import type { SystemConfigEntry } from '../domain/systemConfig.entity.js';
import type { SystemConfigRepositoryPort } from '../domain/systemConfig.repository.port.js';
import { CachedSystemConfigRepository } from './cachedSystemConfig.adapter.js';

const entry = (key: string, value: string) => ({ key, value }) as SystemConfigEntry;

describe('CachedSystemConfigRepository (2026-11-27)', () => {
  it('reads every setting in one query for a while, and drops the copy on a write', async () => {
    let lists = 0;
    const rows = [entry('A', '1'), entry('B', '2')];
    const inner: SystemConfigRepositoryPort = {
      findByKey: async () => {
        throw new Error('not used');
      },
      list: async () => {
        lists += 1;
        return rows.map((r) => ({ ...r }));
      },
      upsertSeed: async () => [],
      updateValue: async (key, value) => {
        const r = rows.find((x) => x.key === key)!;
        r.value = value;
        return r;
      },
    };
    let t = 0;
    const cached = new CachedSystemConfigRepository(inner, 30_000, () => t);
    expect((await Promise.all([cached.findByKey('A'), cached.findByKey('B'), cached.findByKey('C')])).map((e) => e?.value ?? null)).toEqual(['1', '2', null]);
    expect(lists).toBe(1);
    await cached.updateValue('A', '9', 'admin');
    expect((await cached.findByKey('A'))?.value).toBe('9');
    expect(lists).toBe(2);
    t = 30_000;
    await cached.findByKey('B');
    expect(lists).toBe(3);
  });
});
