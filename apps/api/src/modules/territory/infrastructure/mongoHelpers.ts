import type { FilterQuery, SortOrder } from 'mongoose';
import { AppError } from '@/shared/errors/AppError.js';
import { toSkipLimit } from '@/shared/http/pagination.js';
import type { TerritoryListQuery } from '../domain/territoryStatus.js';

/**
 * The lowercased copy of `name` each Territory collection stores and indexes uniquely within its
 * parent. A stored key rather than a collation index: the unique index then enforces the
 * case-insensitive rule by itself, and lookups are a plain equality match.
 */
export function toNameKey(name: string): string {
  return name.toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The filter/sort/skip/limit every Territory `list()` shares. */
export function listOptions<T>(query: TerritoryListQuery): {
  filter: FilterQuery<T>;
  sort: Record<string, SortOrder>;
  skip: number;
  limit: number;
} {
  const filter: Record<string, unknown> = {};
  if (query.status) filter['status'] = query.status;
  if (query.search) filter['name'] = new RegExp(escapeRegex(query.search), 'i');
  return {
    filter: filter as FilterQuery<T>,
    sort: { nameKey: query.sortOrder === 'desc' ? -1 : 1 },
    ...toSkipLimit(query),
  };
}

/**
 * The use cases check for a duplicate name first; this only catches two concurrent writes that
 * both passed that check, so the loser gets the same 409 instead of a 500.
 */
export function rethrowDuplicateName(err: unknown, noun: string): never {
  if ((err as { code?: number }).code === 11000) {
    throw AppError.conflict(`A ${noun} with that name already exists here.`, { field: 'name' });
  }
  throw err;
}
