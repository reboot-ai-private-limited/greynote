import { z } from 'zod';

/**
 * The pagination/search convention every module's list endpoint reuses — this belongs in
 * `shared/`, not any one module, exactly like `response.util.ts`'s envelope.
 */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).optional(),
  sortBy: z.string().trim().min(1).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Converts a page/pageSize pair into the skip/limit a Mongoose `.find()` needs. */
export function toSkipLimit(query: Pick<PaginationQuery, 'page' | 'pageSize'>): {
  skip: number;
  limit: number;
} {
  return { skip: (query.page - 1) * query.pageSize, limit: query.pageSize };
}

export function buildPaginatedResult<T>(
  items: T[],
  total: number,
  query: Pick<PaginationQuery, 'page' | 'pageSize'>,
): PaginatedResult<T> {
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
