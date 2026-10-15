import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
import { paginationQuerySchema } from '@/shared/http/pagination.js';
import { ROUTE_TYPES } from '../domain/route.entity.js';
import { TERRITORY_STATUSES } from '../domain/territoryStatus.js';

/** Checked here so a malformed id is a 400, not a Mongoose CastError surfacing as a 500. */
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

/** Trimmed, inner whitespace collapsed — so "Siliguri  HQ" can't sit beside "Siliguri HQ". */
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((value) => value.replace(/\s+/g, ' '));

export const territoryIdParamsSchema = z.object({ id: objectIdSchema });

const listQuerySchema = paginationQuerySchema.omit({ sortBy: true }).extend({
  status: z.enum(TERRITORY_STATUSES).optional(),
});

export const createZoneBodySchema = z.object({ name: nameSchema });
export const updateZoneBodySchema = z
  .object({ name: nameSchema, status: z.enum(TERRITORY_STATUSES) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const listZonesQuerySchema = listQuerySchema;

export const createHqBodySchema = z.object({ zoneId: objectIdSchema, name: nameSchema });
export const updateHqBodySchema = z
  .object({ name: nameSchema, status: z.enum(TERRITORY_STATUSES) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const listHqsQuerySchema = listQuerySchema.extend({ zoneId: objectIdSchema.optional() });

/** Non-negative, up to 2 decimal places — what `Decimal128` stores losslessly (as `PayBand`). */
const decimalSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with up to 2 decimal places.');

/** Typed by Admin: more than 0, up to 2 decimal places. */
const distanceKmSchema = decimalSchema.refine((value) => Number(value) > 0, 'Must be greater than 0.');

export const createRouteBodySchema = z.object({
  hqId: objectIdSchema,
  /** The route's name is made from it: "<HQ> to <destination>". */
  destinationName: nameSchema,
  distanceKm: distanceKmSchema,
  /** Left out: the type follows the km. Given: kept as chosen, with a warning if the km disagrees. */
  type: z.enum(ROUTE_TYPES).optional(),
  /** Paise per km (₹7.50 = 750). */
  taPerKmRateOverridePaise: paiseSchema.nullable().optional(),
});
export const updateRouteBodySchema = z
  .object({
    destinationName: nameSchema,
    distanceKm: distanceKmSchema,
    type: z.enum(ROUTE_TYPES),
    /** `AUTO`: hand the type back to the km. Choosing a `type` makes it MANUAL. */
    typeSource: z.literal('AUTO'),
    status: z.enum(TERRITORY_STATUSES),
    /** `null` clears the override, falling back to the MR's PayBand rate. */
    taPerKmRateOverridePaise: paiseSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const listRoutesQuerySchema = listQuerySchema.extend({
  hqId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  type: z.enum(ROUTE_TYPES).optional(),
});

export const searchPlacesQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });

export const assignRouteBodySchema = z.object({ userId: objectIdSchema });
export const userIdParamsSchema = z.object({ userId: objectIdSchema });
export const setUserHqBodySchema = z.object({ hqId: objectIdSchema });
export const setManagerCoverageBodySchema = z.object({ hqIds: z.array(objectIdSchema).max(200).default([]), zoneIds: z.array(objectIdSchema).max(50).default([]) });
export const managerCandidatesQuerySchema = z.object({
  /** The employee's designation level (MR 1 … NSM 5): only managers above it are listed. */
  level: z.coerce.number().int().min(1).max(5),
  hqId: objectIdSchema.optional(),
  search: z.string().trim().max(100).optional(),
  /** The employee being edited, left out of their own list. */
  excludeUserId: objectIdSchema.optional(),
});
export const routeAssignmentParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const listRouteAssignmentsQuerySchema = z.object({ status: z.enum(TERRITORY_STATUSES).optional() });
