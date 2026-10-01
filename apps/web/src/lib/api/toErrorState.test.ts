import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from './ApiError';
import { toErrorState } from './toErrorState';

const apiError = (statusCode: number, code: string) =>
  new ApiError({
    success: false,
    statusCode,
    code,
    message: `server says ${code}`,
    request: { method: 'GET', url: '/x', requestId: 'req-9' },
  });

describe('toErrorState', () => {
  const retry = vi.fn();

  it('offers no retry for FORBIDDEN — retrying cannot grant a permission', () => {
    const state = toErrorState(apiError(403, 'FORBIDDEN'), retry);
    expect(state.title).toBe('Not permitted');
    expect(state.onRetry).toBeUndefined();
  });

  it('renders the server message and request id verbatim', () => {
    const state = toErrorState(apiError(404, 'NOT_FOUND'));
    expect(state).toMatchObject({ message: 'server says NOT_FOUND', requestId: 'req-9' });
  });

  it('retries a 5xx but not other 4xx', () => {
    expect(toErrorState(apiError(500, 'INTERNAL'), retry).onRetry).toBe(retry);
    expect(toErrorState(apiError(400, 'VALIDATION_FAILED'), retry).onRetry).toBeUndefined();
  });

  it('treats CONFLICT retry as a refetch', () => {
    expect(toErrorState(apiError(409, 'CONFLICT'), retry).onRetry).toBe(retry);
  });

  it('handles a network failure and an unknown error', () => {
    expect(toErrorState(new NetworkError(), retry).title).toBe('Cannot reach the server');
    expect(toErrorState(new Error('x')).message).toMatch(/Something went wrong/);
  });
});
