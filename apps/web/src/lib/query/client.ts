import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError } from '../api/ApiError';
import { staleTime } from './keys';

/**
 * NEVER RETRY A 4xx: a retried `VALIDATION_FAILED` is three identical failures and a slower
 * message. 401 does not reach here — `withAuth` refreshes and replays once.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) return error.isRetryable;
  return false;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    // Silent by design: a failed read renders an error state where the data would have been.
    // This exists to leave the request id in the console for whoever is looking.
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!(error instanceof ApiError)) return;
        console.error('[query]', query.queryHash, error.code, error.requestId, error.message);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: staleTime.configuration,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        refetchOnWindowFocus: true,
      },
      // A retried POST can create two of something; the user can press the button again.
      mutations: { retry: false },
    },
  });
}
