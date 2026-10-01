import type { HttpErrorBody } from '@greynote/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../api/ApiError';

const refreshCall = vi.fn();
vi.mock('../api/endpoints/auth', () => ({
  authApi: { refresh: refreshCall, login: vi.fn(), logout: vi.fn(), me: vi.fn() },
}));

const session = await import('./session');

const unauthenticated = () =>
  new ApiError({
    success: false,
    statusCode: 401,
    code: 'UNAUTHENTICATED',
    message: 'Please sign in to continue.',
    request: { method: 'POST', url: '/x', requestId: 'req-1' },
  } satisfies HttpErrorBody);

beforeEach(() => {
  refreshCall.mockReset();
});

describe('refresh', () => {
  it('shares one in-flight refresh between concurrent callers', async () => {
    refreshCall.mockResolvedValue({ accessToken: 'tok', expiresIn: 900 });
    const [a, b, c] = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    expect([a, b, c]).toEqual(['tok', 'tok', 'tok']);
    // Rotation: a second call would present a spent token and revoke the whole session family.
    expect(refreshCall).toHaveBeenCalledTimes(1);
  });
});

describe('restore', () => {
  it('resolves false when not signed in', async () => {
    refreshCall.mockRejectedValue(unauthenticated());
    await expect(session.restore()).resolves.toBe(false);
  });

  it('re-throws a network failure so the shell can say the server is unreachable', async () => {
    refreshCall.mockRejectedValue(new NetworkError());
    await expect(session.restore()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('withAuth', () => {
  it('refreshes once and replays after an expired token', async () => {
    refreshCall.mockResolvedValue({ accessToken: 'fresh', expiresIn: 900 });
    const call = vi.fn().mockRejectedValueOnce(unauthenticated()).mockResolvedValueOnce('ok');
    await expect(session.withAuth(call)).resolves.toBe('ok');
    expect(call).toHaveBeenLastCalledWith('fresh');
  });

  it('does not swallow a non-auth failure', async () => {
    const boom = new Error('boom');
    await expect(session.withAuth(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});
