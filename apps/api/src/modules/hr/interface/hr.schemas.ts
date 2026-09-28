import { z } from 'zod';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';
import { HOLIDAY_SCOPES } from '../domain/holiday.entity.js';
import { LEAVE_HALVES } from '../domain/leave.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const nameSchema = z.string().trim().min(1).max(100);
/** Whole or half days. */
export const daysSchema = z
  .number()
  .min(0)
  .max(366)
  .refine((n) => Number.isInteger(n * 2), { message: 'Must be whole or half days.' });

export const idParamsSchema = z.object({ id: objectIdSchema });
export const userIdParamsSchema = z.object({ userId: objectIdSchema });
export const balanceParamsSchema = z.object({ userId: objectIdSchema, leaveTypeId: objectIdSchema });
const leaveYearSchema = z.coerce.number().int().min(2000).max(2100);
export const balanceQuerySchema = z.object({ year: leaveYearSchema.optional() });
export const adjustBalanceBodySchema = z.object({
  year: leaveYearSchema,
  allocatedDays: z.number().min(0).max(366).refine((n) => Number.isInteger(n * 2), { message: 'Must be whole or half days.' }),
  reason: z.string().trim().min(1, 'A reason is required.').max(500),
});

export const createLeaveTypeBodySchema = z.object({ name: nameSchema, isPaid: z.boolean() });
export const updateLeaveTypeBodySchema = z
  .object({ name: nameSchema.optional(), isPaid: z.boolean().optional(), active: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });

export const leavePolicyParamsSchema = z.object({ payBandId: objectIdSchema, leaveTypeId: objectIdSchema });
export const setLeavePolicyBodySchema = z.object({ defaultDays: daysSchema });

export const createHolidayBodySchema = z.object({
  name: nameSchema,
  date: calendarDateSchema,
  scope: z.enum(HOLIDAY_SCOPES),
  zoneIds: z.array(objectIdSchema).max(50).default([]),
  hqIds: z.array(objectIdSchema).max(200).default([]),
});

/** Both ends inclusive, at most ~13 months. The unrefined object is what the OpenAPI doc shows. */
export const holidayQueryObject = z.object({
  from: calendarDateSchema,
  to: calendarDateSchema,
  scope: z.enum(HOLIDAY_SCOPES).optional(),
  zoneId: objectIdSchema.optional(),
  hqId: objectIdSchema.optional(),
});
export const listHolidaysQuerySchema = holidayQueryObject
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 400, { message: 'At most 400 days at a time.', path: ['to'] });

export const leaveBodySchema = z.object({
  leaveTypeId: objectIdSchema,
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  /** Only for a one-day leave. */
  half: z.enum(LEAVE_HALVES).nullish().transform((v) => v ?? null),
  reason: z.string().trim().min(1, 'A reason is required.').max(1000),
});

const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  /** Leaves whose dates meet this range. */
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
};
export const myLeavesQuerySchema = z.object(pageFields);
export const leavesQuerySchema = z.object({ ...pageFields, userId: objectIdSchema.optional() });
