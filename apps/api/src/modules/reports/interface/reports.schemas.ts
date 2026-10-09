import { z } from 'zod';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const ordersQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.'),
  type: z.enum(['DISTRIBUTOR', 'CHEMIST']).optional(),
  status: z.enum(['PLACED', 'DONE', 'CANCELLED']).optional(),
  mrId: objectId.optional(),
});
export const orderIdParamsSchema = z.object({ id: objectId });

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');
export const salesYearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100), distributorId: objectId.optional(), productId: objectId.optional() });
export const salesStatementQuerySchema = z.object({ month: monthSchema, distributorId: objectId.optional(), productId: objectId.optional() });
export const stockQuerySchema = z.object({ month: monthSchema });
export const taDaYearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export const taDaDaysQuerySchema = z.object({ userId: objectId, month: monthSchema });
export const dcrYearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
export const dcrCoverageQuerySchema = z.object({ userId: objectId, month: monthSchema });
export const salaryYearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export const salesDashboardQuerySchema = z
  .object({
    from: calendarDateSchema,
    to: calendarDateSchema,
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(25),
  })
  .refine((q) => q.from <= q.to, { message: 'The range ends before it starts.', path: ['to'] });
