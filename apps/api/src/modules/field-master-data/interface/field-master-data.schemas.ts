import { z } from 'zod';
import { DOCTOR_STATUSES } from '../domain/doctor.entity.js';
import { MASTER_STATUSES } from '../domain/masterStatus.js';

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id.');
const nameSchema = z.string().trim().min(1).max(150);
const textSchema = z.string().trim().min(1).max(500);
const statusSchema = z.enum(MASTER_STATUSES);

export const idParamsSchema = z.object({ id: objectIdSchema });

const pageFields = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().min(1).max(100).optional(),
  status: statusSchema.optional(),
};

/** A registered point: both coordinates or neither (a map pick gives both). */
const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);
export const locationSchema = z.object({ latitude: latitudeSchema, longitude: longitudeSchema });

// ---- Products
export const createProductBodySchema = z.object({
  name: nameSchema,
  sku: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(100),
});
export const updateProductBodySchema = z
  .object({
    name: nameSchema.optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listProductsQuerySchema = z.object({ ...pageFields, category: z.string().trim().min(1).optional() });

// ---- Chemists
export const createChemistBodySchema = z.object({
  routeId: objectIdSchema,
  name: nameSchema,
  address: textSchema,
  /** Picked on a Google map. Omit to add the Chemist now and set the point later. */
  location: locationSchema.nullish().transform((v) => v ?? null),
});
export const updateChemistBodySchema = z
  .object({
    routeId: objectIdSchema.optional(),
    name: nameSchema.optional(),
    address: textSchema.optional(),
    /** `null` clears the registered location. */
    location: locationSchema.nullable().optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listChemistsQuerySchema = z.object({ ...pageFields, routeId: objectIdSchema.optional() });

// ---- Doctors
const emailSchema = z.string().trim().email().max(200);
const doctorFields = {
  category: z.string().trim().min(1).max(100),
  name: nameSchema,
  address: textSchema,
  specialty: z.string().trim().min(1).max(150),
  qualification: z.string().trim().min(1).max(150),
};
export const createDoctorBodySchema = z.object({
  routeId: objectIdSchema,
  ...doctorFields,
  email: emailSchema.nullish().transform((v) => v ?? null),
  /** Picked on a Google map. Omit to add the Doctor now and set the point later. */
  location: locationSchema.nullish().transform((v) => v ?? null),
});
export const updateDoctorBodySchema = z
  .object({
    routeId: objectIdSchema.optional(),
    category: doctorFields.category.optional(),
    name: nameSchema.optional(),
    address: textSchema.optional(),
    specialty: doctorFields.specialty.optional(),
    qualification: doctorFields.qualification.optional(),
    /** `null` clears it. */
    email: emailSchema.nullable().optional(),
    /** `null` clears the registered location. */
    location: locationSchema.nullable().optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listDoctorsQuerySchema = z.object({
  ...pageFields,
  /** Includes `pending` — the MR-added Doctors waiting for approval. */
  status: z.enum(DOCTOR_STATUSES).optional(),
  routeId: objectIdSchema.optional(),
  category: z.string().trim().min(1).optional(),
});
/** An MR's own Doctors — active only, so no status filter. */
export const listAssignedDoctorsQuerySchema = z.object({
  page: pageFields.page,
  pageSize: pageFields.pageSize,
  search: pageFields.search,
  routeId: objectIdSchema.optional(),
  category: z.string().trim().min(1).optional(),
});
export const teamDoctorsQuerySchema = listAssignedDoctorsQuerySchema.extend({ userId: objectIdSchema.optional() });
export const assignDoctorBodySchema = z.object({ userId: objectIdSchema });
export const doctorAssignmentParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

// ---- Doctors an MR adds (offline-first, then approved)
const addedDoctorFields = {
  routeId: objectIdSchema,
  ...doctorFields,
  email: emailSchema.nullish().transform((v) => v ?? null),
  /** The phone's GPS when adding. Required — Admin reviews it on a map at approval. */
  location: locationSchema,
};
export const addDoctorBodySchema = z.object({
  ...addedDoctorFields,
  /** Made by the app once per add, so a retry after a dropped connection can't create a second Doctor. */
  clientRequestId: z.string().trim().min(8).max(100),
});
export const editAddedDoctorBodySchema = z.object(addedDoctorFields);
export const listAddedDoctorsQuerySchema = z.object({ page: pageFields.page, pageSize: pageFields.pageSize });
