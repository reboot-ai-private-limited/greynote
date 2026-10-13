import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
import { MANUAL_EXPENSE_TYPES } from '../domain/expense.entity.js';
import { DOCTOR_SERVICE_TYPES } from '../domain/serviceGift.entity.js';
import { calendarDateSchema } from '@/shared/time/calendarSchemas.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

export const idParamsSchema = z.object({ id: objectIdSchema });

export const callParamsSchema = z.object({ id: objectIdSchema, callId: objectIdSchema });
export const overrideBodySchema = z.object({ comment: z.string().trim().min(1, 'Say why the call is accepted.').max(500) });

/** Both ends inclusive, at most ~13 months. */
const rangeFields = { from: calendarDateSchema, to: calendarDateSchema };
const rangeRules = <T extends { from: string; to: string }>(schema: z.ZodType<T>) =>
  schema
    .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`.', path: ['from'] })
    .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / 86_400_000 <= 400, { message: 'At most 400 days at a time.', path: ['to'] });

export const listDcrsQuerySchema = rangeRules(z.object({ ...rangeFields, userId: objectIdSchema.optional() }));
export const listTeamDcrsQuerySchema = rangeRules(z.object({ ...rangeFields, userId: objectIdSchema.optional() }));

/** The payload of a `DCR_SUBMIT` sync record. */
export const dcrSubmitPayloadSchema = z.object({ reportDate: calendarDateSchema, remarks: z.string().trim().max(1000).nullish().transform((v) => v || null) });

// ---- Payloads of the day's records (sync kinds) ------------------------------------------------

const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const remarksSchema = z.string().trim().max(1000).nullish().transform((v) => v || null);
/** The phone's GPS at the record; `null` if it got no reading (the server then refuses it). Its own geofence result is not sent — the server computes it. The work type is not sent either: the server stamps the day's. */
const gpsFields = {
  capturedLocation: locationSchema.nullable(),
  accuracyMeters: z.number().min(0).max(100_000).nullish().transform((v) => v ?? null),
};
const callFields = {
  reportDate: calendarDateSchema,
  workWith: z.array(objectIdSchema).max(20).default([]),
  remarks: remarksSchema,
  ...gpsFields,
};

export const doctorCallPayloadSchema = z
  .object({
    ...callFields,
    doctorId: objectIdSchema,
    samples: z.array(z.object({ productId: objectIdSchema, quantity: z.number().int().min(1).max(1_000) })).max(50).default([]),
  })
  .refine((c) => new Set(c.samples.map((s) => s.productId)).size === c.samples.length, { message: 'A product is listed twice — give it one line.', path: ['samples'] });
export const chemistCallPayloadSchema = z.object({ ...callFields, chemistId: objectIdSchema });
export const doctorFollowupPayloadSchema = z.object({ reportDate: calendarDateSchema, doctorId: objectIdSchema, remarks: z.string().trim().min(1, 'Remarks are required.').max(1000), ...gpsFields });
export const chemistFollowupPayloadSchema = z.object({ reportDate: calendarDateSchema, chemistId: objectIdSchema, remarks: z.string().trim().min(1, 'Remarks are required.').max(1000), ...gpsFields });

/** A manual expense: an MR-claimed TRAVEL, MEAL or MISC amount in whole paise. TA and DA are computed by the server, never sent. */
export const expensePayloadSchema = z.object({
  reportDate: calendarDateSchema,
  type: z.enum(MANUAL_EXPENSE_TYPES),
  amountPaise: paiseSchema.refine((v) => v > 0, 'The amount must be more than zero.'),
  remarks: remarksSchema,
});

const positivePaise = paiseSchema.refine((v) => v > 0, 'The amount must be more than zero.');

/** An MR's Doctor Service request (the `DOCTOR_SERVICE` sync kind), and Admin's direct one (the same fields, over REST). */
export const doctorServiceFieldsSchema = z.object({
  doctorId: objectIdSchema,
  serviceType: z.enum(DOCTOR_SERVICE_TYPES),
  amountPaise: positivePaise,
  remarks: remarksSchema,
});
export const doctorServicePayloadSchema = doctorServiceFieldsSchema;
export const giftDonePayloadSchema = z.object({ giftId: objectIdSchema });

export const allocateGiftBodySchema = z.object({ doctorId: objectIdSchema, productName: z.string().trim().min(1, 'Name the gift.').max(200), amountPaise: paiseSchema });

export const listExpensesQuerySchema = rangeRules(z.object({ ...rangeFields, userId: objectIdSchema.optional(), paymentStatus: z.enum(['UNPAID', 'PAID']).optional() }));

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-10.');
export const listExpensePayoutsQuerySchema = z.object({ month: monthSchema });
export const payExpensesBodySchema = z.object({ month: monthSchema, userIds: z.array(objectIdSchema).min(1).max(1000).optional() });

export const listServicesQuerySchema = z.object({ userId: objectIdSchema.optional(), doctorId: objectIdSchema.optional() });
export const listGiftsQuerySchema = z.object({ status: z.enum(['PENDING', 'DONE']).optional() });

// ---- Monthly expense statement ------------------------------------------------------------------

const expenseMonthValue = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Must be a month like 2026-09.');
export const expenseMonthParamsSchema = z.object({ month: expenseMonthValue });
export const expenseMonthQuerySchema = z.object({ month: expenseMonthValue, userId: objectIdSchema.optional() });
export const expenseReviewQuerySchema = z.object({ month: expenseMonthValue, userId: objectIdSchema });
export const adjustExpenseRowBodySchema = z.object({ amountPaise: paiseSchema, reason: z.string().trim().min(1, 'A reason is required.').max(500) });
export const addExpenseRowBodySchema = z.object({ userId: objectIdSchema, date: calendarDateSchema, type: z.enum(['TA', 'DA']), amountPaise: paiseSchema.refine((v) => v > 0, 'The amount must be more than zero.'), reason: z.string().trim().min(1, 'A reason is required.').max(500) });
export const expenseOverviewQuerySchema = z.object({ month: expenseMonthValue });
export const grantExpenseMonthBodySchema = z.object({
  userId: objectIdSchema,
  month: expenseMonthValue,
  /** `SUBMIT`: the employee may send the month late. `APPROVE`: the manager may approve it late. */
  phase: z.enum(['SUBMIT', 'APPROVE']),
  reason: z.string().trim().min(1, 'A reason is required.').max(1000),
  /** When the exception ends (ISO date-time). Omitted: `LATE_EXPENSE_GRANT_VALID_HOURS` from now; within `LATE_EXPENSE_GRANT_MAX_HOURS`. */
  expiresAt: z.coerce.date().optional(),
});
export const listExpenseGrantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export const expenseHistoryQuerySchema = z.object({ userId: objectIdSchema.optional() });
/** An employee's own entry in the single "Other" category: a day, an amount in whole paise and a note. */
export const otherExpenseBodySchema = z.object({
  reportDate: calendarDateSchema,
  amountPaise: paiseSchema.refine((v) => v > 0, 'The amount must be more than zero.'),
  remarks: remarksSchema,
});
export const expenseAttachmentParamsSchema = z.object({ id: objectIdSchema, attachmentId: objectIdSchema });
