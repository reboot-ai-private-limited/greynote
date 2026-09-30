import { z } from 'zod';
import { OUTLET_TYPES } from '../domain/monthlyStock.entity.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.');
const qtySchema = z.number().int('Whole units only.').min(0).max(10_000_000);

const lineSchema = z.object({ productId: objectIdSchema, openingQty: qtySchema, closingQty: qtySchema });

/** Body of `POST /sales/monthly-stock` and payload of a `MONTHLY_STOCK` sync record. */
export const monthlyStockBodySchema = z
  .object({
    outletType: z.enum(OUTLET_TYPES),
    outletId: objectIdSchema,
    month: monthSchema,
    lines: z.array(lineSchema).min(1).max(500),
  })
  .refine((b) => new Set(b.lines.map((l) => l.productId)).size === b.lines.length, { message: 'A product appears twice.', path: ['lines'] });

export const listMonthlyStockQuerySchema = z
  .object({ month: monthSchema.optional(), productId: objectIdSchema.optional(), outletType: z.enum(OUTLET_TYPES).optional(), outletId: objectIdSchema.optional() })
  .refine((q) => (q.outletType === undefined) === (q.outletId === undefined), { message: 'Give outletType and outletId together.', path: ['outletId'] });

export const unlockBodySchema = z.object({ month: monthSchema });
export const missingQuerySchema = z.object({ month: monthSchema });
