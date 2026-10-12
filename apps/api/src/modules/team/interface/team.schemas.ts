import { z } from 'zod';
import { calendarDateSchema, calendarMonthSchema } from '@/shared/time/calendarSchemas.js';
import { DAY_STATES } from '../application/usecases/teamToday.usecase.js';

const scope = z.enum(['direct', 'indirect', 'all']).default('all');
const userId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const paging = (pageSize: number) => ({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(pageSize),
});

export const membersQuerySchema = z.object({
  ...paging(50),
  scope,
  status: z.enum(['active', 'all']).default('active'),
  search: z.string().trim().min(1).max(100).optional(),
  userId: userId.optional(),
});

export const todayQuerySchema = z.object({
  ...paging(50),
  scope,
  /** A business day, today or earlier; today when omitted. */
  date: calendarDateSchema.optional(),
  userId: userId.optional(),
  state: z.enum(DAY_STATES).optional(),
  attention: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const plansQuerySchema = z.object({
  ...paging(50),
  scope,
  date: calendarDateSchema,
  userId: userId.optional(),
  planStatus: z.string().trim().min(1).max(40).optional(),
});

export const leavesQuerySchema = z.object({
  scope,
  from: calendarDateSchema,
  to: calendarDateSchema,
  userId: userId.optional(),
  status: z.enum(['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED']).optional(),
});

export const memberParamsSchema = z.object({ id: userId });

export const summaryQuerySchema = z.object({
  /** The month the figures cover; this month when omitted. */
  month: calendarMonthSchema.optional(),
});

export const ordersQuerySchema = z.object({
  ...paging(50),
  scope,
  from: calendarDateSchema,
  to: calendarDateSchema,
  userId: userId.optional(),
  status: z.enum(['PLACED', 'DONE', 'CANCELLED']).optional(),
  outletType: z.enum(['CHEMIST', 'DISTRIBUTOR']).optional(),
});

export const stockQuerySchema = z.object({
  ...paging(50),
  scope,
  month: calendarMonthSchema,
  userId: userId.optional(),
  missingStock: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  secondary: z.enum(['NOT_ENTERED', 'DRAFT', 'PENDING', 'APPROVED', 'REJECTED']).optional(),
});
