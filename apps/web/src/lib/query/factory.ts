import { keepPreviousData, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';
import { withAuth } from '../auth/session';
import { staleTime } from './keys';

/**
 * How every authenticated read is built. A feature hook supplies a key and a call; the rest is
 * decided once here — `withAuth` (refresh on 401), the abort `signal`, and `keepPreviousData`
 * so a table does not blank on every filter change.
 */
export interface AuthedQueryInput<T> {
  queryKey: QueryKey;
  /** Receives the token and the abort signal for THIS attempt — forward the signal. */
  fetch: (token: string, signal: AbortSignal) => Promise<T>;
  staleTime?: number;
  enabled?: boolean;
  refetchOnWindowFocus?: boolean;
}

type AuthedQueryOptions<T> = Pick<
  UseQueryOptions<T, Error, T, QueryKey>,
  'queryKey' | 'queryFn' | 'staleTime' | 'enabled' | 'refetchOnWindowFocus' | 'placeholderData'
>;

export function authedQueryOptions<T>({
  queryKey,
  fetch,
  staleTime: freshFor = staleTime.configuration,
  enabled,
  refetchOnWindowFocus,
}: AuthedQueryInput<T>): AuthedQueryOptions<T> {
  return {
    queryKey,
    queryFn: ({ signal }) => withAuth((token) => fetch(token, signal)),
    staleTime: freshFor,
    placeholderData: keepPreviousData,
    ...(enabled === undefined ? {} : { enabled }),
    ...(refetchOnWindowFocus === undefined ? {} : { refetchOnWindowFocus }),
  };
}
