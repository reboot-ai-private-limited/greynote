import type { Hq } from './hq.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export interface HqRepositoryPort {
  findById(id: string): Promise<Hq | null>;
  findByIds(ids: string[]): Promise<Hq[]>;
  /** Case-insensitive, within one Zone. */
  findByName(zoneId: string, name: string): Promise<Hq | null>;
  list(query: TerritoryListQuery & { zoneId?: string | undefined }): Promise<{ items: Hq[]; total: number }>;
  countActiveInZone(zoneId: string): Promise<number>;
  create(input: Omit<Hq, 'id'>): Promise<Hq>;
  update(id: string, input: Partial<Omit<Hq, 'id' | 'zoneId'>>): Promise<Hq>;
}
