import type { Area, AreaType } from './area.entity.js';
import type { TerritoryListQuery } from './territoryStatus.js';

export interface AreaRepositoryPort {
  findById(id: string): Promise<Area | null>;
  /** Case-insensitive, within one HQ. */
  findByName(hqId: string, name: string): Promise<Area | null>;
  list(
    query: TerritoryListQuery & { hqId?: string | undefined; type?: AreaType | undefined },
  ): Promise<{ items: Area[]; total: number }>;
  countActiveInHq(hqId: string): Promise<number>;
  create(input: Omit<Area, 'id'>): Promise<Area>;
  update(id: string, input: Partial<Omit<Area, 'id' | 'hqId'>>): Promise<Area>;
}
