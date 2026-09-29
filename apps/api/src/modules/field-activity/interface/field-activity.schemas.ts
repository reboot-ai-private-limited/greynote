import { z } from 'zod';
import { WORKING_TYPES } from '@greynote/contracts';
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
export const dcrSubmitPayloadSchema = z.object({ reportDate: calendarDateSchema });

// ---- Payloads of the day's records (sync kinds) ------------------------------------------------

const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
const remarksSchema = z.string().trim().max(1000).nullish().transform((v) => v || null);
const callFields = {
  reportDate: calendarDateSchema,
  workingType: z.enum(WORKING_TYPES),
  workWith: z.array(objectIdSchema).max(20).default([]),
  remarks: remarksSchema,
  /** The phone's GPS at the call; `null` if it got no reading. Its own geofence result is not sent — the server computes it. */
  capturedLocation: locationSchema.nullable(),
  accuracyMeters: z.number().min(0).max(100_000).nullish().transform((v) => v ?? null),
};

export const doctorCallPayloadSchema = z
  .object({
    ...callFields,
    doctorId: objectIdSchema,
    samples: z.array(z.object({ productId: objectIdSchema, quantity: z.number().int().min(1).max(1_000) })).max(50).default([]),
  })
  .refine((c) => new Set(c.samples.map((s) => s.productId)).size === c.samples.length, { message: 'A product is listed twice — give it one line.', path: ['samples'] });
export const chemistCallPayloadSchema = z.object({ ...callFields, chemistId: objectIdSchema });
export const doctorFollowupPayloadSchema = z.object({ reportDate: calendarDateSchema, doctorId: objectIdSchema, remarks: z.string().trim().min(1, 'Remarks are required.').max(1000) });
export const chemistFollowupPayloadSchema = z.object({ reportDate: calendarDateSchema, chemistId: objectIdSchema, remarks: z.string().trim().min(1, 'Remarks are required.').max(1000) });

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

export const listServicesQuerySchema = z.object({ userId: objectIdSchema.optional(), doctorId: objectIdSchema.optional() });
export const listGiftsQuerySchema = z.object({ status: z.enum(['PENDING', 'DONE']).optional() });
