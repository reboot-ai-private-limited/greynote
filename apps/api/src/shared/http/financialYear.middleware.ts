import type { RequestHandler } from 'express';
import { AppError } from '@/shared/errors/AppError.js';
import { readBusinessDay, readConfig, type ConfigReader } from '@/shared/config/readConfig.js';
import { addDays, businessDate, dayStartInstant, leaveYearOf, leaveYearRange, parseCalendarDate, parseMonthName } from '@/shared/time/businessTime.js';

/**
 * The financial-year "time machine" (docs/hld/09, decision-log 2026-09-30). A client views a past year by sending
 * `X-Financial-Year: <start year>` on each request — stateless, like the access token. The year is named by the year
 * it starts in (with an April start FY2025 is 2025-04-01 … 2026-03-31), the same as the leave year.
 *
 * `req.financialYear` is set **only for a past year**; with no header, or the current year, nothing here does anything.
 */
export interface FinancialYearContext {
  year: number;
  /** First and last calendar day, `YYYY-MM-DD`. */
  from: string;
  to: string;
  timeZone: string;
  /** `HH:mm` the business day starts: a financial year runs from this time on its first day. */
  dayStart: string;
}

export const FINANCIAL_YEAR_HEADER = 'x-financial-year';

/** The routes (relative to `/api`) that stay open while a past year is being viewed: signing in and out, and keeping the session alive. */
const OPEN_WHILE_VIEWING = new Set(['/identity/auth/login', '/identity/auth/refresh', '/identity/auth/logout']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const invalid = (message: string) => AppError.badRequest(message, { code: 'INVALID_FINANCIAL_YEAR' });

/** Mount once, ahead of every module router. Reads `FY_START_MONTH` and `BUSINESS_TIMEZONE` from Config on each request that carries the header. */
export function financialYearContext(config: ConfigReader, now: () => Date = () => new Date()): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.get(FINANCIAL_YEAR_HEADER);
      if (header === undefined) return next();
      if (!/^\d{4}$/.test(header.trim())) throw invalid('X-Financial-Year must be the year the financial year starts in, e.g. 2025.');
      const year = Number(header.trim());

      const { timeZone, dayStart } = await readBusinessDay(config);
      const startMonth = await readConfig(config, 'FY_START_MONTH', parseMonthName);
      const current = leaveYearOf(businessDate(now(), timeZone, dayStart), startMonth);
      if (year > current) throw invalid(`Financial year ${year} has not started yet.`);
      if (year === current) return next();

      req.financialYear = { year, ...leaveYearRange(year, startMonth), timeZone, dayStart };
      if (!READ_METHODS.has(req.method) && !OPEN_WHILE_VIEWING.has(req.path)) {
        throw AppError.conflict(`Financial year ${year} is read-only. Switch back to the current year to make changes.`, { code: 'FINANCIAL_YEAR_READ_ONLY' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * What a list route filters by, so the selected year can bound it. `fill`: put the year's own range in when the request
 * leaves it out — off where the route's own cap on the range is shorter than a year (a daily plan list), so the caller
 * must ask for a window inside the year.
 */
export type FinancialYearRule =
  | { kind: 'date'; from: string; to: string; fill: boolean }
  /** `YYYY-MM` months; `single` is an optional exact-month parameter (checked, never filled). */
  | { kind: 'month'; from: string; to: string; fill: boolean; single?: string }
  /** ISO date-times with an offset. */
  | { kind: 'instant'; from: string; to: string; fill: boolean }
  /** A leave/financial year number. */
  | { kind: 'year'; param: string };

const outside = (what: string, fy: FinancialYearContext) =>
  AppError.badRequest(`${what} is outside financial year ${fy.year} (${fy.from} to ${fy.to}).`, { code: 'OUTSIDE_FINANCIAL_YEAR', financialYear: fy.year, from: fy.from, to: fy.to });

/**
 * Bounds one list route to the selected past year: fills what is missing (when `fill`) and refuses what falls outside.
 * Place it after `authenticate()` and **before** `validate()`; a route that does not use it is not scoped, and the
 * route-classification test (`financialYear.routes.test.ts`) fails until it is listed as scoped, timeless or by-id.
 */
export function scopeToFinancialYear(rule: FinancialYearRule): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    const fy = req.financialYear;
    if (!fy) return next();
    try {
      const query = req.query as Record<string, unknown>;
      const str = (name: string): string | undefined => (typeof query[name] === 'string' && query[name] !== '' ? (query[name] as string) : undefined);

      if (rule.kind === 'year') {
        const given = str(rule.param);
        if (given === undefined) query[rule.param] = String(fy.year);
        else if (Number(given) !== fy.year) throw outside(`Year ${given}`, fy);
        return next();
      }

      // For `date`/`month` the values sort as text; an `instant` is compared as a time.
      const bounds = (() => {
        if (rule.kind === 'date') return { lo: fy.from, hi: fy.to, cmp: (a: string) => a };
        if (rule.kind === 'month') return { lo: fy.from.slice(0, 7), hi: fy.to.slice(0, 7), cmp: (a: string) => a };
        const start = dayStartInstant(parseCalendarDate(fy.from), fy.dayStart, fy.timeZone);
        const end = new Date(dayStartInstant(parseCalendarDate(addDays(fy.to, 1)), fy.dayStart, fy.timeZone).getTime() - 1);
        return { lo: start.toISOString(), hi: end.toISOString(), cmp: (a: string) => new Date(a).toISOString() };
      })();

      if (rule.kind === 'month' && rule.single) {
        const one = str(rule.single);
        if (one !== undefined && (one < bounds.lo || one > bounds.hi)) throw outside(`Month ${one}`, fy);
        if (one !== undefined) return next();
      }
      for (const [name, edge] of [[rule.from, bounds.lo], [rule.to, bounds.hi]] as const) {
        const given = str(name);
        if (given === undefined) {
          if (rule.fill) query[name] = edge;
          continue;
        }
        // A value that is not a date at all is left for validation to refuse.
        let comparable: string;
        try {
          if (rule.kind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(given)) continue;
          if (rule.kind === 'month' && !/^\d{4}-\d{2}$/.test(given)) continue;
          comparable = bounds.cmp(given);
        } catch {
          continue;
        }
        if (comparable < bounds.lo || comparable > bounds.hi) throw outside(`${name} ${given}`, fy);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
  // Lets the route-classification test see which routes are scoped, and by what.
  return Object.assign(handler, { financialYearRule: rule });
}
