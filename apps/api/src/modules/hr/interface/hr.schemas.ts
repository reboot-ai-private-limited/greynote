import { z } from 'zod';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';
import { HOLIDAY_SCOPES } from '../domain/holiday.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const nameSchema = z.string().trim().min(1).max(100);
/** Whole or half days. */
export const daysSchema = z
  .number()
  .min(0)
  .max(366)
  .refine((n) => Number.isInteger(n * 2), { message: 'Must be whole or half days.' });

export const idParamsSchema = z.object({ id: objectIdSchema });

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
