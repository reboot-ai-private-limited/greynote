/**
 * The slice of a query a tile needs. `UseQueryResult` satisfies it, and so can a hook that merges
 * several queries into one tile (employees = active + onboarding).
 */
export interface TileQuery<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => unknown;
}
