import { z } from 'zod';
import { parseCalendarDate, parseCalendarMonth } from './businessTime.js';

const accepts = (parse: (v: string) => unknown) => (v: string) => {
  try {
    parse(v);
    return true;
  } catch {
    return false;
  }
};

/** A calendar day, `YYYY-MM-DD` — no time or offset, and no impossible days like Feb 30. */
export const calendarDateSchema = z.string().refine(accepts(parseCalendarDate), { message: 'Must be a date as YYYY-MM-DD.' });

/** A calendar month, `YYYY-MM`. */
export const calendarMonthSchema = z.string().refine(accepts(parseCalendarMonth), { message: 'Must be a month as YYYY-MM.' });
