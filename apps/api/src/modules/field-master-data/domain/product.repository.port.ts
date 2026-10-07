import type { PaginatedResult } from '@/shared/http/pagination.js';
import type { MasterStatus, PageQuery } from './masterStatus.js';
import type { Product } from './product.entity.js';

export interface ProductFilter extends PageQuery {
  search?: string | undefined;
  category?: string | undefined;
  status?: MasterStatus | undefined;
}

export interface ProductRepositoryPort {
  list(filter: ProductFilter): Promise<PaginatedResult<Product>>;
  findById(id: string): Promise<Product | null>;
  /** Batched; an id that is not there is skipped. */
  findByIds(ids: string[]): Promise<Product[]>;
  /** The whole active catalog — the phone's cache. */
  listActive(): Promise<Product[]>;
  /** `null` if the SKU is taken. */
  create(input: Omit<Product, 'id'>): Promise<Product | null>;
  /** `null` if the row is missing (see `findById`) or the new SKU is taken. */
  update(id: string, change: Partial<Omit<Product, 'id'>>): Promise<Product | null>;
}
