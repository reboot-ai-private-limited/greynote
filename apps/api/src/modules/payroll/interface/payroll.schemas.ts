import { z } from 'zod';
import { calendarMonthSchema } from '@/shared/time/calendarSchemas.js';
import { PAYROLL_STATUSES } from '../domain/payrollRun.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const idParamsSchema = z.object({ id: objectIdSchema });
/** No `userIds` = every active FIELD employee. */
export const generateBodySchema = z.object({ month: calendarMonthSchema, userIds: z.array(objectIdSchema).min(1).max(2000).optional() });
/** `month` is one month; `fromMonth`/`toMonth` a range, both ends included (how a whole financial year is listed). */
export const listRunsQuerySchema = z
  .object({ month: calendarMonthSchema.optional(), fromMonth: calendarMonthSchema.optional(), toMonth: calendarMonthSchema.optional(), userId: objectIdSchema.optional(), status: z.enum(PAYROLL_STATUSES).optional() })
  .refine((q) => !q.fromMonth || !q.toMonth || q.fromMonth <= q.toMonth, { message: '`fromMonth` must not be after `toMonth`.', path: ['fromMonth'] });
/** The employee's own list: months only; whose and which status are never the caller's to choose. */
export const myPayslipsQuerySchema = z
  .object({ month: calendarMonthSchema.optional(), fromMonth: calendarMonthSchema.optional(), toMonth: calendarMonthSchema.optional() })
  .refine((q) => !q.fromMonth || !q.toMonth || q.fromMonth <= q.toMonth, { message: '`fromMonth` must not be after `toMonth`.', path: ['fromMonth'] });
