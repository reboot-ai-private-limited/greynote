import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import type { RoleName } from '@greynote/contracts';
import { AppError } from '@/shared/errors/AppError.js';

const TEST_SECRET = 'test-access-secret-that-is-at-least-32-chars';

// Pin the secret so these tests never depend on a developer's local .env.
vi.mock('@/config/env.js', () => ({
  env: { JWT_ACCESS_SECRET: TEST_SECRET, JWT_ACCESS_TOKEN_TTL_SECONDS: 900 },
}));

const { authenticate } = await import('./authenticate.middleware.js');
const { requireRole } = await import('./authorize.middleware.js');
const { signAccessToken } = await import('./jwt.util.js');

function makeReq(authorization?: string, user?: Request['user']): Request {
  return { headers: authorization ? { authorization } : {}, user } as Request;
}

/** Runs a middleware and returns what it passed to `next` (undefined = allowed through). */
function run(middleware: (req: Request, res: Response, next: NextFunction) => void, req: Request): unknown {
  let passed: unknown = 'next-not-called';
  middleware(req, {} as Response, (arg?: unknown) => {
    passed = arg;
  });
  return passed;
}

describe('authenticate()', () => {
  it('attaches the verified payload to req.user for a valid Bearer token', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'FIELD', employeeCode: 'MR001' });
    const req = makeReq(`Bearer ${token}`);

    expect(run(authenticate(), req)).toBeUndefined();
    expect(req.user).toMatchObject({ sub: 'user-1', role: 'FIELD', employeeCode: 'MR001' });
  });

  it('401s when there is no Authorization header', () => {
    const err = run(authenticate(), makeReq());
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ statusCode: 401 });
  });

  it('401s for a non-Bearer scheme', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'FIELD', employeeCode: 'MR001' });
    expect(run(authenticate(), makeReq(`Basic ${token}`))).toMatchObject({ statusCode: 401 });
  });

  it('401s for a token signed with a different secret', () => {
    const forged = jwt.sign({ sub: 'user-1', role: 'ADMIN', employeeCode: 'X' }, 'some-other-secret-also-32-chars-long!!');
    expect(() => run(authenticate(), makeReq(`Bearer ${forged}`))).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('401s for an expired token', () => {
    const expired = jwt.sign(
      { sub: 'user-1', role: 'FIELD', employeeCode: 'MR001', exp: Math.floor(Date.now() / 1000) - 60 },
      TEST_SECRET,
    );
    expect(() => run(authenticate(), makeReq(`Bearer ${expired}`))).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });

  it('401s for a garbled token', () => {
    expect(() => run(authenticate(), makeReq('Bearer not-a-jwt'))).toThrow(
      expect.objectContaining({ statusCode: 401 }),
    );
  });
});

describe('requireRole()', () => {
  const asRole = (role: RoleName) => makeReq(undefined, { sub: 'u', role, employeeCode: 'E', iat: 0, exp: 0 });

  it('lets a caller with an allowed role through', () => {
    expect(run(requireRole('ADMIN', 'HR'), asRole('HR'))).toBeUndefined();
  });

  it('403s a caller whose role is not in the list', () => {
    expect(run(requireRole('ADMIN'), asRole('FIELD'))).toMatchObject({ statusCode: 403 });
  });

  it('401s when authenticate() did not run first (no req.user)', () => {
    expect(run(requireRole('ADMIN'), makeReq())).toMatchObject({ statusCode: 401 });
  });
});
