import { z } from 'zod';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');

export const monthQuerySchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.'), month: monthSchema });
export const payrollCalendarQuerySchema = z.object({ month: monthSchema });
