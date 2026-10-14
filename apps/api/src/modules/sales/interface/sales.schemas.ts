import { z } from 'zod';
import { PAYMENT_MODES } from '@greynote/contracts';
import { paiseSchema } from '@/shared/money/paise.js';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';
import { ORDER_STATUSES } from '../domain/order.entity.js';
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

// ---- Orders

const orderLineSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().int('Whole units only.').min(1).max(1_000_000),
  unitPricePaise: paiseSchema,
  /** Units to give free on top: the office's (an employee's own order ignores it). */
  freeQty: z.number().int('Whole units only.').min(0).max(1_000_000).default(0),
});

/** Body of `POST /sales/orders` and payload of an `ORDER` sync record. Amounts are worked out by the server. */
export const placeOrderBodySchema = z
  .object({
    outletType: z.enum(OUTLET_TYPES),
    outletId: objectIdSchema,
    orderDate: calendarDateSchema.optional(),
    remarks: z.string().trim().max(1000).nullish().transform((v) => v || null),
    lines: z.array(orderLineSchema).min(1).max(200),
  })
  .refine((b) => new Set(b.lines.map((l) => l.productId)).size === b.lines.length, { message: 'A product appears twice.', path: ['lines'] });

/** Body of `POST /sales/orders/on-behalf`: Admin or the Accountant adds an order for a field employee. */
export const placeOrderForBodySchema = placeOrderBodySchema.and(z.object({ userId: objectIdSchema }));

/** Body of `PATCH /sales/orders/:id`: the new lines (replacing the old) and remarks. */
export const editOrderBodySchema = z
  .object({
    remarks: z.string().trim().max(1000).nullish().transform((v) => v || null),
    lines: z.array(orderLineSchema).min(1).max(200),
  })
  .refine((b) => new Set(b.lines.map((l) => l.productId)).size === b.lines.length, { message: 'A product appears twice.', path: ['lines'] });

/** Body of `POST /sales/orders/:id/complete` (optional; Admin or the Accountant): what was supplied and given free, per line. A product left out is supplied in full. */
export const completeOrderBodySchema = z
  .object({
    supply: z
      .array(z.object({ productId: objectIdSchema, suppliedQty: z.number().int('Whole units only.').min(0).max(1_000_000), freeQty: z.number().int('Whole units only.').min(0).max(1_000_000).default(0) }))
      .min(1)
      .max(200)
      .optional(),
  })
  .refine((b) => !b.supply || new Set(b.supply.map((l) => l.productId)).size === b.supply.length, { message: 'A product appears twice.', path: ['supply'] });

export const orderIdParamsSchema = z.object({ id: objectIdSchema });
export const listOrdersQuerySchema = z
  .object({ status: z.enum(ORDER_STATUSES).optional(), from: calendarDateSchema.optional(), to: calendarDateSchema.optional(), outletType: z.enum(OUTLET_TYPES).optional(), outletId: objectIdSchema.optional() })
  .refine((q) => (q.outletType === undefined) === (q.outletId === undefined), { message: 'Give outletType and outletId together.', path: ['outletId'] })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] });

export const recordPaymentBodySchema = z.object({
  distributorId: objectIdSchema,
  paymentDate: calendarDateSchema,
  amountPaise: paiseSchema.refine((n) => n > 0, 'A payment must be more than zero.'),
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(100).nullish().transform((v) => v || null),
  note: z.string().trim().max(500).nullish().transform((v) => v || null),
});
export const listPaymentsQuerySchema = z
  .object({ distributorId: objectIdSchema, from: calendarDateSchema, to: calendarDateSchema })
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] });
export const paymentTotalsQuerySchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] });
export const cancelPaymentBodySchema = z.object({ reason: z.string().trim().min(1, 'Say why it is cancelled.').max(300) });

const qtySchemaWhole = z.number().int().min(0).max(100_000_000);
export const statementQuerySchema = z.object({ distributorId: objectIdSchema, month: monthSchema });
export const saveStatementBodySchema = z.object({
  distributorId: objectIdSchema,
  month: monthSchema,
  lines: z
    .array(
      z.object({
        productId: objectIdSchema,
        openingQty: qtySchemaWhole,
        secondaryQty: qtySchemaWhole.nullable(),
        adjustmentQty: z.number().int().min(-100_000_000).max(100_000_000),
        reason: z.string().trim().max(300).nullish(),
      }),
    )
    .min(1)
    .max(500)
    .refine((lines) => new Set(lines.map((l) => l.productId)).size === lines.length, { message: 'A product appears twice.' }),
});

export const employeeSalesQuerySchema = z.object({ userId: objectIdSchema, month: monthSchema });
const uniqueProducts = (lines: Array<{ productId: string }>) => new Set(lines.map((l) => l.productId)).size === lines.length;
export const saveEmployeeSecondaryBodySchema = z.object({
  userId: objectIdSchema,
  month: monthSchema,
  lines: z
    .array(z.object({ productId: objectIdSchema, qty: qtySchemaWhole.optional(), amountPaise: paiseSchema.optional() }).refine((l) => l.qty !== undefined || l.amountPaise !== undefined, { message: 'Give units or an amount.' }))
    .min(1)
    .max(500)
    .refine(uniqueProducts, { message: 'A product appears twice.' }),
});
export const submitEmployeeSecondaryBodySchema = z.object({ month: monthSchema });
export const saveEmployeePrimaryBodySchema = z.object({
  userId: objectIdSchema,
  month: monthSchema,
  lines: z
    .array(z.object({ productId: objectIdSchema, adjustmentQty: z.number().int().min(-100_000_000).max(100_000_000), reason: z.string().trim().max(300).nullish() }))
    .min(1)
    .max(500)
    .refine(uniqueProducts, { message: 'A product appears twice.' }),
});
