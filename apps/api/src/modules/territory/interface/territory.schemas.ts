import { z } from 'zod';
import { paginationQuerySchema } from '@/shared/http/pagination.js';
import { AREA_TYPES } from '../domain/area.entity.js';
import { TERRITORY_STATUSES } from '../domain/territoryStatus.js';

/** Checked here so a malformed id is a 400, not a Mongoose CastError surfacing as a 500. */
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');

/** Trimmed, inner whitespace collapsed — so "Siliguri  HQ" can't sit beside "Siliguri HQ". */
const nameSchema = z
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
