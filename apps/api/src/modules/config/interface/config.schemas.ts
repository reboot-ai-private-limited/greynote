import { z } from 'zod';

export const configKeyParamsSchema = z.object({
  key: z.string().min(1),
});

export const updateConfigBodySchema = z.object({
  value: z.string().min(1),
});

export const financialYearBodySchema = z.object({ year: z.number().int().min(2000).max(2200) });
