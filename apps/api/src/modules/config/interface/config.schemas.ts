import { z } from 'zod';

export const configKeyParamsSchema = z.object({
  key: z.string().min(1),
});

export const updateConfigBodySchema = z.object({
  value: z.string().min(1),
});
