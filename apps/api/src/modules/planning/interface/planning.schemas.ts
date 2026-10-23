import { z } from 'zod';
import { calendarDateSchema, calendarMonthSchema } from '@/shared/time/calendarSchemas.js';
import { DAY_KINDS, PLAN_KINDS, WORKING_TYPES } from '../domain/plan.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const planDateSchema = calendarDateSchema;
export const planMonthSchema = calendarMonthSchema;

export const planIdParamsSchema = z.object({ id: objectIdSchema });

export const planDaySchema = z.object({
  workingType: z.enum(WORKING_TYPES),
  workWith: z.array(objectIdSchema).max(20).default([]),
  routeIds: z.array(objectIdSchema).max(20).default([]),
  remarks: z.string().trim().max(1000).nullish().transform((v) => v || null),
});


/** The doctors to call on a day (the route stays the Monthly Plan's). Missed calls still owed are added by the server. */
export const setDailyPlanDoctorsBodySchema = z.object({
  planDate: planDateSchema,
  doctorIds: z.array(objectIdSchema).max(50),
});

/**
 * The owner's own change to their day: working type, who they work with and the doctors. Routes and remarks are not sent: the routes
 * follow the type (and, for a manager, the people they work with) and the remarks are the Monthly Plan's. A day that isn't field work
 * or a doctor campaign sends no doctors.
 */
export const setDailyPlanBodySchema = z.object({
  planDate: planDateSchema,
  workingType: z.enum(WORKING_TYPES),
  workWith: z.array(objectIdSchema).max(20).default([]),
  doctorIds: z.array(objectIdSchema).max(500).default([]),
});

/** `userIds` is a comma-separated list of team members' ids. */
export const teamSuggestQuerySchema = z.object({
  date: planDateSchema,
  userIds: z
    .string()
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(objectIdSchema).min(1).max(20)),
});

export const carryOverQuerySchema = z.object({ date: planDateSchema });

/** Both ends inclusive. The unrefined object is what the OpenAPI doc shows. */
export const dateRangeQuerySchema = z.object({ from: planDateSchema, to: planDateSchema });
export const listDailyPlansQuerySchema = dateRangeQuerySchema
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 92, {
    message: 'At most 93 days at a time.',
    path: ['to'],
  });

export const saveMonthlyPlanBodySchema = z.object({
  planMonth: planMonthSchema,
  entries: z
    .array(
      planDaySchema.extend({
        planDate: planDateSchema,
        // Stay and transit days come back with the plan and may be sent as they are; the server rebuilds them from the trip.
        dayKind: z.enum(DAY_KINDS).default('NORMAL'),
        returnDate: planDateSchema.nullish().transform((v) => v ?? null),
      }),
    )
    .max(31),
});

/** Both ends inclusive. The unrefined object is what the OpenAPI doc shows. */
export const monthRangeQuerySchema = z.object({ from: planMonthSchema, to: planMonthSchema });
export const listMonthlyPlansQuerySchema = monthRangeQuerySchema
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
  .refine((q) => Number(q.to.slice(0, 4)) * 12 + Number(q.to.slice(5)) - (Number(q.from.slice(0, 4)) * 12 + Number(q.from.slice(5))) < 12, {
    message: 'At most 12 months at a time.',
    path: ['to'],
  });

export const grantLateSubmitBodySchema = z.object({
  userId: objectIdSchema,
  kind: z.enum(PLAN_KINDS),
  /** `YYYY-MM-DD` for `DAILY_PLAN`, `YYYY-MM` for `MONTHLY_PLAN`. */
  planKey: z.string().trim().min(1),
  reason: z.string().trim().min(1, 'A reason is required.').max(1000),
  /** When the exception ends (ISO date-time). Omitted: `LATE_PLAN_GRANT_VALID_HOURS` from now. Must be in the future and within `LATE_PLAN_GRANT_MAX_HOURS`. */
  expiresAt: z.coerce.date().optional(),
});

export const listLateSubmitGrantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  userId: objectIdSchema.optional(),
  kind: z.enum(PLAN_KINDS).optional(),
});

/** A manager's or Admin's amendment of an employee's waiting Monthly Plan: the whole month as it should be, and why. */
export const amendMonthlyPlanBodySchema = z.object({
  entries: saveMonthlyPlanBodySchema.shape.entries,
  reason: z.string().trim().min(1, 'A reason is required.').max(500),
});

/** A manager's or Admin's amendment of an employee's Daily Plan: the whole day as it should be, and why. */
export const amendDailyPlanBodySchema = planDaySchema.extend({
  reason: z.string().trim().min(1, 'A reason is required.').max(500),
});
