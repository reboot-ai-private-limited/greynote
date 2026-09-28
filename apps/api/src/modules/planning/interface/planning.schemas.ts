import { z } from 'zod';
import { parseCalendarDate, parseCalendarMonth } from '@/shared/time/businessTime.js';
import { PLAN_KINDS, WORKING_TYPES } from '../domain/plan.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

/** A calendar day, `YYYY-MM-DD` — plan dates aren't instants, so no time or offset. */
export const planDateSchema = z.string().refine(
  (v) => {
    try {
      parseCalendarDate(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a date as YYYY-MM-DD.' },
);

/** A calendar month, `YYYY-MM`. */
export const planMonthSchema = z.string().refine(
  (v) => {
    try {
      parseCalendarMonth(v);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Must be a month as YYYY-MM.' },
);

export const planIdParamsSchema = z.object({ id: objectIdSchema });

export const planDaySchema = z.object({
  workingType: z.enum(WORKING_TYPES),
  workWith: z.array(objectIdSchema).max(20).default([]),
  routeIds: z.array(objectIdSchema).max(20).default([]),
  remarks: z.string().trim().max(1000).nullish().transform((v) => v || null),
});

export const saveDailyPlanBodySchema = planDaySchema.extend({ planDate: planDateSchema });

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
  entries: z.array(planDaySchema.extend({ planDate: planDateSchema })).max(31),
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
});

export const listLateSubmitGrantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  userId: objectIdSchema.optional(),
  kind: z.enum(PLAN_KINDS).optional(),
});
