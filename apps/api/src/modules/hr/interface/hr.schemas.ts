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
export const attachmentParamsSchema = z.object({ id: objectIdSchema, attachmentId: objectIdSchema });
export const userIdParamsSchema = z.object({ userId: objectIdSchema });
export const balanceParamsSchema = z.object({ userId: objectIdSchema, leaveTypeId: objectIdSchema });
const leaveYearSchema = z.coerce.number().int().min(2000).max(2100);
export const balanceQuerySchema = z.object({ year: leaveYearSchema.optional() });
export const adjustBalanceBodySchema = z.object({
  year: leaveYearSchema,
  allocatedDays: z.number().min(0).max(366).refine((n) => Number.isInteger(n * 2), { message: 'Must be whole or half days.' }),
  reason: z.string().trim().min(1, 'A reason is required.').max(500),
});

export const leaveApprovalGrantBodySchema = z.object({
  reason: z.string().trim().min(1, 'A reason is required.').max(500),
  expiresAt: z.coerce.date().optional(),
});

export const createLeaveTypeBodySchema = z.object({ name: nameSchema, isPaid: z.boolean(), allowsProof: z.boolean().optional() });
export const updateLeaveTypeBodySchema = z
  .object({ name: nameSchema.optional(), isPaid: z.boolean().optional(), allowsProof: z.boolean().optional(), active: z.boolean().optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });

export const leavePolicyParamsSchema = z.object({ payBandId: objectIdSchema, leaveTypeId: objectIdSchema });
export const setLeavePolicyBodySchema = z.object({ defaultDays: daysSchema });

export const createHolidayBodySchema = z.object({
  name: nameSchema,
  /** The first (or only) day. */
  date: calendarDateSchema,
  /** The last day of a holiday that runs several days, at most 31 in all; one row is stored per day. */
  endDate: calendarDateSchema.optional(),
  scope: z.enum(HOLIDAY_SCOPES),
  zoneIds: z.array(objectIdSchema).max(50).default([]),
  hqIds: z.array(objectIdSchema).max(200).default([]),
});

/** `PATCH /holidays/:id` takes the same fields as an add: the holiday is replaced by what is sent. */
export const updateHolidayBodySchema = createHolidayBodySchema;

/** `group=true` removes every day of a holiday added as a range, not only this one. */
export const deleteHolidayQuerySchema = z.object({ group: z.enum(['true', 'false']).optional() });
/** `group=true` replaces every day of a holiday added as a range. */
export const updateHolidayQuerySchema = deleteHolidayQuerySchema;

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

export const weeklyOffsQueryObject = z.object({ from: calendarDateSchema, to: calendarDateSchema });
export const listWeeklyOffsQuerySchema = weeklyOffsQueryObject
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 400, { message: 'At most 400 days at a time.', path: ['to'] });

export const leaveBodySchema = z.object({
  leaveTypeId: objectIdSchema,
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
  /** Half-day leave was removed (2026-10-05): a leave is whole days. Sending a half is refused, not ignored. */
  half: z
    .unknown()
    .refine((v) => v === undefined || v === null, { message: 'Half-day leave is not available. Request whole days.' })
    .transform(() => null),
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
