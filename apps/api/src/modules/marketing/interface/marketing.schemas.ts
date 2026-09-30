import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
import { calendarDateSchema, calendarMonthSchema } from '@/shared/time/calendarSchemas.js';
import { CAMPAIGN_STATUSES, VISUAL_CATEGORIES, VISUAL_STATUSES } from '../domain/marketing.entities.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const optionalId = z.union([objectIdSchema, z.literal('').transform(() => undefined)]).optional();

export const idParamsSchema = z.object({ id: objectIdSchema });
export const userIdParamsSchema = z.object({ userId: objectIdSchema });

/** Text fields that ride along with the multipart file. */
export const createVisualBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.enum(VISUAL_CATEGORIES),
  productId: optionalId,
});
export const listVisualsQuerySchema = z.object({ status: z.enum(VISUAL_STATUSES).optional(), productId: objectIdSchema.optional() });
export const setStatusBodySchema = z.object({ status: z.enum(VISUAL_STATUSES) });

export const createCampaignBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  startDate: calendarDateSchema,
  endDate: calendarDateSchema,
});
export const listCampaignsQuerySchema = z.object({ status: z.enum(CAMPAIGN_STATUSES).optional() });
export const setCampaignStatusBodySchema = z.object({ status: z.enum(CAMPAIGN_STATUSES) });

export const setTargetBodySchema = z.object({
  userId: objectIdSchema,
  month: calendarMonthSchema,
  productId: objectIdSchema.nullish().transform((v) => v ?? null),
  campaignId: objectIdSchema.nullish().transform((v) => v ?? null),
  targetAmountPaise: paiseSchema.refine((n) => n > 0, 'A target must be more than zero.'),
});
export const targetQuerySchema = z.object({ month: calendarMonthSchema, productId: objectIdSchema.optional(), campaignId: objectIdSchema.optional() });
