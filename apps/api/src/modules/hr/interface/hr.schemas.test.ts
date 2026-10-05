import { describe, expect, it } from 'vitest';
import { leaveBodySchema } from './hr.schemas.js';

const body = { leaveTypeId: '507f1f77bcf86cd799439011', startDate: '2026-10-05', endDate: '2026-10-05', reason: 'Fever' };

describe('leave request body', () => {
  it('has no half: a request without one is whole days', () => {
    expect(leaveBodySchema.parse(body).half).toBeNull();
    expect(leaveBodySchema.parse({ ...body, half: null }).half).toBeNull();
  });

  it('refuses a half-day, naming it, instead of ignoring it', () => {
    const result = leaveBodySchema.safeParse({ ...body, half: 'FIRST' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe('Half-day leave is not available. Request whole days.');
  });
});
