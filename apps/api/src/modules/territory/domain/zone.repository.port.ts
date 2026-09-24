import type { TerritoryListQuery } from './territoryStatus.js';
import type { Zone } from './zone.entity.js';

export interface ZoneRepositoryPort {
  findById(id: string): Promise<Zone | null>;
  /** Case-insensitive. */
  findByName(name: string): Promise<Zone | null>;
  list(query: TerritoryListQuery): Promise<{ items: Zone[]; total: number }>;
  create(input: Omit<Zone, 'id'>): Promise<Zone>;
  update(id: string, input: Partial<Omit<Zone, 'id'>>): Promise<Zone>;
}
