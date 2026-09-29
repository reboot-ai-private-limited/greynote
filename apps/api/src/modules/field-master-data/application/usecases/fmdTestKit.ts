import { buildPaginatedResult, type PaginatedResult } from '@/shared/http/pagination.js';
import type { Chemist } from '../../domain/chemist.entity.js';
import type { ChemistFilter, ChemistRepositoryPort } from '../../domain/chemist.repository.port.js';
import type { Product } from '../../domain/product.entity.js';
import type { ProductFilter, ProductRepositoryPort } from '../../domain/product.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';

/** In-memory fakes for Field Master Data's use-case tests — no Mongo, no other module's internals. */

const paged = <T>(rows: T[], f: { page: number; pageSize: number }): PaginatedResult<T> =>
  buildPaginatedResult(rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), rows.length, f);

export class FakeProducts implements ProductRepositoryPort {
  rows: Product[] = [];
  private taken(sku: string, exceptId?: string) {
    return this.rows.some((p) => p.id !== exceptId && p.sku.trim().toLowerCase() === sku.trim().toLowerCase());
  }
  async list(f: ProductFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (p) =>
          (!f.category || p.category === f.category) &&
          (!f.status || p.status === f.status) &&
          (!search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((p) => p.id === id) ?? null;
  }
  async create(input: Omit<Product, 'id'>) {
    if (this.taken(input.sku)) return null;
    const row = { ...input, id: `product-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Product, 'id'>>) {
    if (change.sku !== undefined && this.taken(change.sku, id)) return null;
    const i = this.rows.findIndex((p) => p.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
}

export class FakeChemists implements ChemistRepositoryPort {
  rows: Chemist[] = [];
  async list(f: ChemistFilter) {
    const search = f.search?.toLowerCase();
    return paged(
      this.rows.filter(
        (c) =>
          (!f.routeId || c.routeId === f.routeId) &&
          (!f.status || c.status === f.status) &&
          (!search || c.name.toLowerCase().includes(search)),
      ),
      f,
    );
  }
  async findById(id: string) {
    return this.rows.find((c) => c.id === id) ?? null;
  }
  async create(input: Omit<Chemist, 'id'>) {
    const row = { ...input, id: `chemist-${this.rows.length + 1}` };
    this.rows.push(row);
    return row;
  }
  async update(id: string, change: Partial<Omit<Chemist, 'id'>>) {
    const i = this.rows.findIndex((c) => c.id === id);
    if (i < 0) return null;
    this.rows[i] = { ...this.rows[i]!, ...change };
    return this.rows[i]!;
  }
}

export class FakeTerritory implements TerritoryPort {
  routes = new Map<string, 'active' | 'inactive'>([
    ['route-1', 'active'],
    ['route-2', 'active'],
    ['route-off', 'inactive'],
  ]);
  async getRoute(routeId: string) {
    const status = this.routes.get(routeId);
    return status ? { id: routeId, status } : null;
  }
}
