import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { AppError } from '@/shared/errors/AppError.js';
import { errorHandler } from './error-handler.js';

function run(err: unknown) {
  let status = 0;
  let body = { code: '', message: '' };
  const res = {
    status(code: number) {
      status = code;
      return { json: (payload: typeof body) => void (body = payload) };
    },
  };
  errorHandler(err, { method: 'POST', originalUrl: '/api/sync/push', ip: '::1' } as unknown as Request, res as unknown as Response, () => undefined);
  return { status, body };
}

describe('errorHandler', () => {
  it('a body over the limit is a 413 the client can act on, not a 500', () => {
    const { status, body } = run(Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 }));
    expect(status).toBe(413);
    expect(body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(body.message).not.toContain('entity');
  });

  it('malformed JSON is a 400', () => {
    const { status, body } = run(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 }));
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.message).not.toContain('token');
  });

  it('an AppError keeps its own status, and anything unrecognised is still a generic 500', () => {
    expect(run(AppError.conflict('x')).status).toBe(409);
    const { status, body } = run(new Error('boom: mongodb://secret'));
    expect(status).toBe(500);
    expect(body.message).not.toContain('secret'); // the debug trace outside production is by design; the message is what the caller reads
  });
});
