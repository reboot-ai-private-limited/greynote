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

/** A place Admin confirmed on the map: an HQ's base place or a Route's destination. */
export const placeBodySchema = z.object({
  label: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().trim().min(1),
});

export const createHqBodySchema = z.object({ zoneId: objectIdSchema, name: nameSchema, basePlace: placeBodySchema });
export const updateHqBodySchema = z
  .object({ name: nameSchema, status: z.enum(TERRITORY_STATUSES), basePlace: placeBodySchema })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const listHqsQuerySchema = listQuerySchema.extend({ zoneId: objectIdSchema.optional() });

/** Non-negative, up to 2 decimal places — what `Decimal128` stores losslessly (as `PayBand`). */
const decimalSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with up to 2 decimal places.');

export const createRouteBodySchema = z.object({
  hqId: objectIdSchema,
  name: nameSchema,
  /** Left out: the type follows the distance. Given: kept as chosen, with a warning if the distance disagrees. */
  type: z.enum(ROUTE_TYPES).optional(),
  destination: placeBodySchema,
  /** Paise per km (₹7.50 = 750). */
  taPerKmRateOverridePaise: paiseSchema.nullable().optional(),
});
export const updateRouteBodySchema = z
  .object({
    name: nameSchema,
    type: z.enum(ROUTE_TYPES),
    /** `AUTO`: hand the type back to the distance. Choosing a `type` makes it MANUAL. */
    typeSource: z.literal('AUTO'),
    status: z.enum(TERRITORY_STATUSES),
    /** `null` clears the override, falling back to the MR's PayBand rate. */
    taPerKmRateOverridePaise: paiseSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const updateRouteDestinationBodySchema = z.object({
  destination: placeBodySchema,
  /** The route's `revision` this edit was made against. */
  revision: z.number().int().positive(),
});
export const overrideRouteDistanceBodySchema = z.object({
  distanceKm: decimalSchema.refine((value) => Number(value) > 0, 'Must be greater than 0.'),
});
export const listRoutesQuerySchema = listQuerySchema.extend({
  hqId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  type: z.enum(ROUTE_TYPES).optional(),
});

export const searchPlacesQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });

export const assignRouteBodySchema = z.object({ userId: objectIdSchema });
export const userIdParamsSchema = z.object({ userId: objectIdSchema });
export const setUserHqBodySchema = z.object({ hqId: objectIdSchema });
export const routeAssignmentParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const listRouteAssignmentsQuerySchema = z.object({ status: z.enum(TERRITORY_STATUSES).optional() });
