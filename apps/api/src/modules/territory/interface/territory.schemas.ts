import { z } from 'zod';
import { paginationQuerySchema } from '@/shared/http/pagination.js';
import { AREA_TYPES } from '../domain/area.entity.js';
import { MAX_WAYPOINTS, MIN_WAYPOINTS } from '../domain/route.entity.js';
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
export const updateHqBodySchema = updateZoneBodySchema;
export const listHqsQuerySchema = listQuerySchema.extend({ zoneId: objectIdSchema.optional() });

export const createAreaBodySchema = z.object({
  hqId: objectIdSchema,
  name: nameSchema,
  type: z.enum(AREA_TYPES),
});
export const updateAreaBodySchema = z
  .object({ name: nameSchema, type: z.enum(AREA_TYPES), status: z.enum(TERRITORY_STATUSES) })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const listAreasQuerySchema = listQuerySchema.extend({
  hqId: objectIdSchema.optional(),
  type: z.enum(AREA_TYPES).optional(),
});

/** Non-negative, up to 2 decimal places — what `Decimal128` stores losslessly (as `PayBand`). */
const decimalSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a number with up to 2 decimal places.');

const waypointSchema = z.object({
  label: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  placeId: z.string().trim().min(1),
});
const waypointsSchema = z.array(waypointSchema).min(MIN_WAYPOINTS).max(MAX_WAYPOINTS);

export const createRouteBodySchema = z.object({
  areaId: objectIdSchema,
  name: nameSchema,
  waypoints: waypointsSchema,
  taPerKmRateOverride: decimalSchema.nullable().optional(),
});
export const updateRouteBodySchema = z
  .object({
    name: nameSchema,
    status: z.enum(TERRITORY_STATUSES),
    /** `null` clears the override, falling back to the MR's PayBand rate. */
    taPerKmRateOverride: decimalSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.');
export const updateRouteWaypointsBodySchema = z.object({
  waypoints: waypointsSchema,
  /** The route's `revision` this edit was made against. */
  revision: z.number().int().positive(),
});
export const overrideRouteDistanceBodySchema = z.object({
  distanceKm: decimalSchema.refine((value) => Number(value) > 0, 'Must be greater than 0.'),
});
export const listRoutesQuerySchema = listQuerySchema.extend({
  areaId: objectIdSchema.optional(),
  hqId: objectIdSchema.optional(),
});

export const searchPlacesQuerySchema = z.object({ q: z.string().trim().min(2).max(200) });

export const assignRouteBodySchema = z.object({ userId: objectIdSchema });
export const routeAssignmentParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const listRouteAssignmentsQuerySchema = z.object({ status: z.enum(TERRITORY_STATUSES).optional() });
