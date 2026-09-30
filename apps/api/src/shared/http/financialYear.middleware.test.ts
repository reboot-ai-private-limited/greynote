import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import type { AppError } from '@/shared/errors/AppError.js';
import { financialYearContext, scopeToFinancialYear, type FinancialYearContext, type FinancialYearRule } from './financialYear.middleware.js';

const config = (startMonth = 'APRIL') => ({ get: async (k: string) => ({ BUSINESS_TIMEZONE: 'Asia/Kolkata', FY_START_MONTH: startMonth })[k] ?? '' });

/** Runs a middleware against a fake request and reports what it did: `next()` with no error, or the error it passed on. */
async function run(mw: (req: never, res: never, next: (err?: unknown) => void) => unknown, req: Partial<Request> & { query?: Record<string, unknown> }) {
  let outcome: { error?: AppError } = {};
  const full = { method: 'GET', path: '/x', query: {}, get: (h: string) => (req as { headers?: Record<string, string> }).headers?.[h.toLowerCase()], ...req } as Request;
  await new Promise<void>((resolve) => {
    Promise.resolve(mw(full as never, {} as never, (err?: unknown) => {
      if (err) outcome = { error: err as AppError };
      resolve();
    }));
  });
  return { ...outcome, req: full };
}
const withHeader = (year: string, over: Partial<Request> = {}) => ({ headers: { 'x-financial-year': year }, ...over }) as Partial<Request>;
const details = (e?: AppError) => (e?.publicDetails ?? {}) as { code?: string };

describe('financialYearContext', () => {
  const at = (iso: string, start = 'APRIL') => financialYearContext(config(start), () => new Date(iso)) as never;

  it('does nothing without the header', async () => {
    const { error, req } = await run(at('2026-09-30T10:00:00+05:30'), {});
    expect(error).toBeUndefined();
    expect(req.financialYear).toBeUndefined();
  });

  it('does nothing for the current year', async () => {
    const { error, req } = await run(at('2026-09-30T10:00:00+05:30'), withHeader('2026', { method: 'POST' }));
    expect(error).toBeUndefined();
    expect(req.financialYear).toBeUndefined(); // even a write is fine in the current year
  });

  it('sets the context for a past year: the year named by its start, April to March', async () => {
    const { error, req } = await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025'));
    expect(error).toBeUndefined();
    expect(req.financialYear).toEqual({ year: 2025, from: '2025-04-01', to: '2026-03-31', timeZone: 'Asia/Kolkata' });
  });

  it('refuses a malformed or future year with 400 INVALID_FINANCIAL_YEAR', async () => {
    for (const bad of ['abc', '25', '20255', '2025-26', '', ' ']) {
      const { error } = await run(at('2026-09-30T10:00:00+05:30'), withHeader(bad));
      expect(error?.statusCode, bad).toBe(400);
      expect(details(error).code).toBe('INVALID_FINANCIAL_YEAR');
    }
    const future = await run(at('2026-09-30T10:00:00+05:30'), withHeader('2027'));
    expect(future.error?.statusCode).toBe(400);
  });

  it('the year turns over at midnight business time on 1 April', async () => {
    // 23:59:59 IST on 31 March 2026 is still FY2025; 00:00:00 IST on 1 April is FY2026.
    expect((await run(at('2026-03-31T23:59:59+05:30'), withHeader('2025'))).req.financialYear).toBeUndefined();
    expect((await run(at('2026-03-31T23:59:59+05:30'), withHeader('2026'))).error?.statusCode).toBe(400); // not started
    expect((await run(at('2026-04-01T00:00:00+05:30'), withHeader('2025'))).req.financialYear?.year).toBe(2025);
    expect((await run(at('2026-04-01T00:00:00+05:30'), withHeader('2026'))).req.financialYear).toBeUndefined();
    // 18:30 UTC on 31 March is already 1 April in India.
    expect((await run(at('2026-03-31T18:30:00Z'), withHeader('2025'))).req.financialYear?.year).toBe(2025);
  });

  it('follows FY_START_MONTH: a January start is the calendar year; an October start wraps', async () => {
    const jan = await run(at('2026-09-30T10:00:00+05:30', 'JANUARY'), withHeader('2025'));
    expect(jan.req.financialYear).toMatchObject({ from: '2025-01-01', to: '2025-12-31' });
    const oct = await run(at('2026-09-30T10:00:00+05:30', 'OCTOBER'), withHeader('2025')); // today is 30 Sep 2026 → FY2025 (Oct 2025…) is the current year
    expect(oct.req.financialYear).toBeUndefined();
    const octPast = await run(at('2026-09-30T10:00:00+05:30', 'OCTOBER'), withHeader('2024'));
    expect(octPast.req.financialYear).toMatchObject({ from: '2024-10-01', to: '2025-09-30' });
  });

  it('while a past year is viewed, every write is a 409 FINANCIAL_YEAR_READ_ONLY', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { error } = await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025', { method, path: '/sales/orders' }));
      expect(error?.statusCode, method).toBe(409);
      expect(details(error).code).toBe('FINANCIAL_YEAR_READ_ONLY');
    }
    for (const path of ['/planning/daily/submit', '/approvals/abc/decide', '/payroll/generate', '/sync/push', '/config/FY_START_MONTH']) {
      expect((await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025', { method: 'POST', path }))).error?.statusCode, path).toBe(409);
    }
  });

  it('reads pass, and so do login, refresh and logout', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) expect((await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025', { method }))).error).toBeUndefined();
    for (const path of ['/identity/auth/login', '/identity/auth/refresh', '/identity/auth/logout']) {
      expect((await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025', { method: 'POST', path }))).error, path).toBeUndefined();
    }
    // …but not the neighbours.
    expect((await run(at('2026-09-30T10:00:00+05:30'), withHeader('2025', { method: 'POST', path: '/identity/auth/logout-all' }))).error?.statusCode).toBe(409);
  });
});

describe('scopeToFinancialYear', () => {
  const fy: FinancialYearContext = { year: 2025, from: '2025-04-01', to: '2026-03-31', timeZone: 'Asia/Kolkata' };
  const scope = (rule: FinancialYearRule, query: Record<string, unknown>, ctx: FinancialYearContext | null = fy) => run(scopeToFinancialYear(rule) as never, { query, financialYear: ctx ?? undefined } as never);
  const date: FinancialYearRule = { kind: 'date', from: 'from', to: 'to', fill: true };

  it('is a no-op without a past-year context, and leaves the query alone', async () => {
    const { error, req } = await scope(date, { from: '2030-01-01' }, null);
    expect(error).toBeUndefined();
    expect(req.query).toEqual({ from: '2030-01-01' });
  });

  describe('dates', () => {
    it('fills a missing range with the year', async () => {
      expect((await scope(date, {})).req.query).toEqual({ from: '2025-04-01', to: '2026-03-31' });
      expect((await scope(date, { from: '2025-06-01' })).req.query).toEqual({ from: '2025-06-01', to: '2026-03-31' });
    });

    it('does not fill where the route caps the range shorter than a year', async () => {
      const { error, req } = await scope({ ...date, fill: false }, {});
      expect(error).toBeUndefined();
      expect(req.query).toEqual({});
    });

    it('accepts a range inside the year, edges included', async () => {
      expect((await scope(date, { from: '2025-04-01', to: '2026-03-31' })).error).toBeUndefined();
      expect((await scope(date, { from: '2025-12-01', to: '2025-12-31' })).error).toBeUndefined();
    });

    it('refuses anything outside with 400 OUTSIDE_FINANCIAL_YEAR — never trims', async () => {
      for (const q of [{ from: '2025-03-31' }, { from: '2025-04-01', to: '2026-04-01' }, { to: '2027-01-01' }, { from: '2026-05-01', to: '2026-05-31' }]) {
        const { error, req } = await scope(date, q);
        expect(error?.statusCode, JSON.stringify(q)).toBe(400);
        expect(details(error).code).toBe('OUTSIDE_FINANCIAL_YEAR');
        expect(req.query).toEqual(q); // untouched
      }
    });

    it('leaves a value that is not a date for validation to refuse', async () => {
      expect((await scope({ ...date, fill: false }, { from: 'garbage' })).error).toBeUndefined();
    });
  });

  describe('months', () => {
    const month: FinancialYearRule = { kind: 'month', from: 'fromMonth', to: 'toMonth', fill: true, single: 'month' };
    it('fills the year’s first and last month; edges are in', async () => {
      expect((await scope(month, {})).req.query).toEqual({ fromMonth: '2025-04', toMonth: '2026-03' });
      expect((await scope(month, { fromMonth: '2025-04', toMonth: '2026-03' })).error).toBeUndefined();
    });
    it('checks an exact month and does not fill around it', async () => {
      const ok = await scope(month, { month: '2025-11' });
      expect(ok.error).toBeUndefined();
      expect(ok.req.query).toEqual({ month: '2025-11' });
      expect((await scope(month, { month: '2026-04' })).error?.statusCode).toBe(400);
      expect((await scope(month, { month: '2025-03' })).error?.statusCode).toBe(400);
    });
    it('refuses a range outside', async () => {
      expect((await scope(month, { fromMonth: '2025-03' })).error?.statusCode).toBe(400);
      expect((await scope(month, { toMonth: '2026-04' })).error?.statusCode).toBe(400);
    });
    it('a route with only from/to months (monthly plans)', async () => {
      const plans: FinancialYearRule = { kind: 'month', from: 'from', to: 'to', fill: true };
      expect((await scope(plans, {})).req.query).toEqual({ from: '2025-04', to: '2026-03' });
    });
  });

  describe('instants', () => {
    const instant: FinancialYearRule = { kind: 'instant', from: 'from', to: 'to', fill: true };
    it('fills with the year’s first and last millisecond in business time', async () => {
      const { req } = await scope(instant, {});
      expect(req.query).toEqual({ from: '2025-03-31T18:30:00.000Z', to: '2026-03-31T18:29:59.999Z' }); // 00:00 IST 1 Apr … 23:59:59.999 IST 31 Mar
    });
    it('the boundary is business midnight, whatever offset the client writes', async () => {
      expect((await scope(instant, { from: '2025-04-01T00:00:00+05:30' })).error).toBeUndefined();
      expect((await scope(instant, { from: '2025-03-31T23:59:59+05:30' })).error?.statusCode).toBe(400);
      expect((await scope(instant, { to: '2026-03-31T23:59:59+05:30' })).error).toBeUndefined();
      expect((await scope(instant, { to: '2026-04-01T00:00:00+05:30' })).error?.statusCode).toBe(400);
      expect((await scope(instant, { from: '2025-03-31T20:00:00Z' })).error).toBeUndefined(); // 01:30 IST on 1 April
    });
    it('leaves an unparsable value for validation', async () => {
      expect((await scope({ ...instant, fill: false }, { from: 'nope' })).error).toBeUndefined();
    });
  });

  describe('year', () => {
    const year: FinancialYearRule = { kind: 'year', param: 'year' };
    it('defaults to the selected year and refuses any other', async () => {
      expect((await scope(year, {})).req.query).toEqual({ year: '2025' });
      expect((await scope(year, { year: '2025' })).error).toBeUndefined();
      expect((await scope(year, { year: '2026' })).error?.statusCode).toBe(400);
      expect((await scope(year, { year: '2024' })).error?.statusCode).toBe(400);
    });
  });
});
