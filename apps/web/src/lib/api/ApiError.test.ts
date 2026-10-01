import { describe, expect, it } from 'vitest';
import { ApiError } from './ApiError';

describe('ApiError.detailCode', () => {
  it('prefers the refined data.code over the generic code', () => {
    const error = new ApiError({
      success: false,
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Financial year 2025 is read-only.',
      data: { code: 'FINANCIAL_YEAR_READ_ONLY' },
      request: { method: 'POST', url: '/x', requestId: 'r' },
    });
    expect(error.detailCode).toBe('FINANCIAL_YEAR_READ_ONLY');
  });

  it('falls back to code', () => {
    const error = new ApiError({
      success: false,
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'no',
      request: { method: 'GET', url: '/x', requestId: 'r' },
    });
    expect(error.detailCode).toBe('FORBIDDEN');
  });
});
