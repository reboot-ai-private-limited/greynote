import { PRODUCT_TYPES } from '@greynote/contracts';
import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
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
const priceSchema = paiseSchema.refine((n) => n > 0, 'Must be more than 0.');
const productFields = {
  composition: z.string().trim().min(1).max(300),
  type: z.enum(PRODUCT_TYPES),
  packSize: z.string().trim().min(1).max(40),
  ptsPaise: priceSchema,
  ptrPaise: priceSchema,
  mrpPaise: priceSchema,
  gstPercent: z.union([z.literal(5), z.literal(12), z.literal(18), z.literal(28)]),
};
export const createProductBodySchema = z.object({
  name: nameSchema,
  sku: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(100),
  ...productFields,
  division: z.string().trim().min(1).max(100).optional(),
});
export const updateProductBodySchema = z
  .object({
    name: nameSchema.optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    composition: productFields.composition.optional(),
    type: productFields.type.optional(),
    packSize: productFields.packSize.optional(),
    ptsPaise: priceSchema.optional(),
    ptrPaise: priceSchema.optional(),
    mrpPaise: priceSchema.optional(),
    gstPercent: productFields.gstPercent.optional(),
    /** `null` clears it. */
    division: z.string().trim().min(1).max(100).nullable().optional(),
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

// ---- Distributors
const gstSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/, 'Must be a 15-character GST number.');
const mobileSchema = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number of 10 to 15 digits.');
const distributorFields = {
  name: nameSchema,
  gstNumber: gstSchema,
  contactPerson: z.string().trim().min(1).max(150),
  mobile: mobileSchema,
  address: textSchema,
};
export const createDistributorBodySchema = z.object({
  routeId: objectIdSchema,
  ...distributorFields,
  /** Picked on a Google map. Omit to add the Distributor now and set the point later. */
  location: locationSchema.nullish().transform((v) => v ?? null),
  assignedMrId: objectIdSchema.nullish().transform((v) => v ?? null),
  assignedAsmId: objectIdSchema.nullish().transform((v) => v ?? null),
  // No default: whether a Distributor may take primary or secondary orders is the client's call, so Admin says.
  primarySalesEnabled: z.boolean(),
  secondarySalesEnabled: z.boolean(),
});
export const updateDistributorBodySchema = z
  .object({
    routeId: objectIdSchema.optional(),
    name: nameSchema.optional(),
    gstNumber: gstSchema.optional(),
    contactPerson: distributorFields.contactPerson.optional(),
    mobile: mobileSchema.optional(),
    address: textSchema.optional(),
    /** `null` clears the registered location. */
    location: locationSchema.nullable().optional(),
    /** `null` un-assigns. */
    assignedMrId: objectIdSchema.nullable().optional(),
    assignedAsmId: objectIdSchema.nullable().optional(),
    primarySalesEnabled: z.boolean().optional(),
    secondarySalesEnabled: z.boolean().optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listDistributorsQuerySchema = z.object({
  ...pageFields,
  routeId: objectIdSchema.optional(),
  /** Zone and HQ narrow by territory; the most specific one given is used. */
  hqId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  assignedMrId: objectIdSchema.optional(),
});

// ---- Doctor sample allocations
const quantitySchema = z.number().int().min(1).max(100_000);
export const issueSampleBodySchema = z.object({ productId: objectIdSchema, quantity: quantitySchema });
export const adjustSampleBodySchema = z.object({ quantityAllocated: z.number().int().min(0).max(100_000) });
export const sampleAllocationParamsSchema = z.object({ id: objectIdSchema, productId: objectIdSchema });
