/** The `data` of every paginated list endpoint (`apps/api/src/shared/http/pagination.ts`). */
export interface PaginatedDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationQueryDto {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
  sortOrder?: 'asc' | 'desc' | undefined;
}
