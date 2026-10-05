import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RoleName } from '@greynote/contracts';

vi.mock('@/config/env.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  env: {
    JWT_ACCESS_SECRET: 'test-access-secret-that-is-at-least-32-chars',
    JWT_ACCESS_TOKEN_TTL_SECONDS: 900,
    LOG_LEVEL: 'silent',
  },
}));

const { buildPayBandsRouter } = await import('./payBands.route.js');
const { buildDesignationsRouter } = await import('./designations.route.js');
const { signAccessToken } = await import('@/shared/http/jwt.util.js');
const { errorHandler } = await import('@/shared/http/error-handler.js');

const stub = <T>(result: T) => ({ execute: vi.fn().mockResolvedValue(result) });

const payBandBody = {
  name: 'G1',
  taPerKmRatePaise: 750,
  hqDaPaise: 20000,
  exStationDaPaise: 30000,
  outStationDaPaise: 40000,
};

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/pay-bands',
    buildPayBandsRouter({ list: stub([]), create: stub({ id: '1' }), update: stub({ id: '1' }) } as never),
  );
  app.use(
    '/designations',
    buildDesignationsRouter({ list: stub([]), create: stub({ id: '1' }), update: stub({ id: '1' }) } as never),
  );
  app.use(errorHandler as never);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

async function call(role: RoleName, method: string, path: string, body?: unknown): Promise<number> {
  const token = signAccessToken({ sub: 'u1', role, employeeCode: 'X1' });
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return res.status;
}

describe('Pay Bands — who may', () => {
  it.each<[RoleName, number]>([
    ['ADMIN', 200],
    ['HR', 200],
    ['ACCOUNTANT', 200],
    ['FIELD', 403],
  ])('%s reads → %i', async (role, status) => {
    expect(await call(role, 'GET', '/pay-bands')).toBe(status);
  });

  it.each<[RoleName, number]>([
    ['ADMIN', 201],
    ['HR', 201],
    ['ACCOUNTANT', 403],
    ['FIELD', 403],
  ])('%s creates → %i', async (role, status) => {
    expect(await call(role, 'POST', '/pay-bands', payBandBody)).toBe(status);
  });

  it.each<[RoleName, number]>([
    ['HR', 200],
    ['ACCOUNTANT', 403],
  ])('%s updates → %i', async (role, status) => {
    expect(await call(role, 'PATCH', '/pay-bands/abc', { hqDaPaise: 25000 })).toBe(status);
  });
});

describe('Designations — who may', () => {
  it.each<[RoleName, number]>([
    ['ADMIN', 200],
    ['HR', 200],
    ['ACCOUNTANT', 403],
    ['FIELD', 403],
  ])('%s reads → %i', async (role, status) => {
    expect(await call(role, 'GET', '/designations')).toBe(status);
  });

  it('HR creates and updates', async () => {
    expect(await call('HR', 'POST', '/designations', { name: 'MR', level: 1 })).toBe(201);
    expect(await call('HR', 'PATCH', '/designations/abc', { level: 2 })).toBe(200);
  });

  it('an Accountant cannot write', async () => {
    expect(await call('ACCOUNTANT', 'POST', '/designations', { name: 'MR', level: 1 })).toBe(403);
  });
});
