import type { ErrorStateProps } from '@/components/ui/ErrorState';
import { ApiError, NetworkError } from './ApiError';

/**
 * Turn a thrown error into what `<ErrorState>` should render — the whole taxonomy in one place,
 * because the alternative is every screen deciding whether a FORBIDDEN gets a retry button.
 */
export function toErrorState(error: unknown, retry?: () => void): ErrorStateProps {
  if (error instanceof NetworkError) {
    return {
      message: error.message,
      title: 'Cannot reach the server',
      ...(retry && { onRetry: retry }),
    };
  }

  if (!(error instanceof ApiError)) {
    return { message: 'Something went wrong. Please try again.', ...(retry && { onRetry: retry }) };
  }

  const base = { message: error.message, requestId: error.requestId };

  switch (error.code) {
    case 'FORBIDDEN':
      // No retry: retrying cannot grant a permission.
      return { ...base, title: 'Not permitted' };
    case 'NOT_FOUND':
      return { ...base, title: 'Not found' };
    case 'CONFLICT':
      // "Retry" means REFETCH: the data moved under us, so what is on screen is what is wrong.
      return { ...base, title: 'This changed while you were working', ...(retry && { onRetry: retry }) };
    default:
      return { ...base, ...(error.isRetryable && retry ? { onRetry: retry } : {}) };
  }
}
