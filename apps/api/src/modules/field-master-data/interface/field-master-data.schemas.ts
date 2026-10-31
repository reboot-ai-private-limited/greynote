import { MAX_VISIT_FREQUENCY, PRODUCT_TYPES } from '@greynote/contracts';
import { z } from 'zod';
import { paiseSchema } from '@/shared/money/paise.js';
import { DISTRIBUTOR_DOCUMENT_TYPES } from '../domain/distributor.entity.js';
import { CHEMIST_STATUSES } from '../domain/chemist.entity.js';
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
  /** HSN (goods) or SAC (services): 4 to 8 digits. */
  hsn: z.string().trim().regex(/^\d{4,8}$/, 'HSN/SAC must be 4 to 8 digits.'),
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
    hsn: productFields.hsn.optional(),
    /** `null` clears it. */
    division: z.string().trim().min(1).max(100).nullable().optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listProductsQuerySchema = z.object({ ...pageFields, category: z.string().trim().min(1).optional() });

// ---- Specialities
export const createSpecialtyBodySchema = z.object({ name: z.string().trim().min(1).max(100) });
export const updateSpecialtyBodySchema = z
  .object({ name: z.string().trim().min(1).max(100).optional(), status: statusSchema.optional() })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listSpecialtiesQuerySchema = z.object({ ...pageFields });

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
/** Includes `pending` — the employee-added Chemists waiting for approval. */
export const listChemistsQuerySchema = z.object({ ...pageFields, status: z.enum(CHEMIST_STATUSES).optional(), routeId: objectIdSchema.optional() });

// ---- Chemists an employee adds (offline-first, then approved)
const addedChemistFields = {
  routeId: objectIdSchema,
  name: nameSchema,
  address: textSchema,
  /** The phone's GPS when adding. Required — Admin reviews it on a map at approval. */
  location: locationSchema,
};
export const addChemistBodySchema = z.object({
  ...addedChemistFields,
  /** Made by the app once per add, so a retry after a dropped connection can't create a second Chemist. */
  clientRequestId: z.string().trim().min(8).max(100),
});
export const editAddedChemistBodySchema = z.object(addedChemistFields);
export const listAddedChemistsQuerySchema = z.object({ page: pageFields.page, pageSize: pageFields.pageSize });

// ---- Doctors
const emailSchema = z.string().trim().email().max(200);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date.');
const frequencySchema = z.number().int().min(1).max(MAX_VISIT_FREQUENCY, `At most ${MAX_VISIT_FREQUENCY} visits a month.`);
const mobileSchema = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number of 10 to 15 digits.');
const doctorExtras = {
  clinicName: z.string().trim().max(150).nullish().transform((v) => (v ? v : null)),
  phone: mobileSchema.nullish().transform((v) => v ?? null),
  dateOfBirth: dateOnly.nullish().transform((v) => v ?? null),
  anniversary: dateOnly.nullish().transform((v) => v ?? null),
  visitFrequency: frequencySchema.nullish().transform((v) => v ?? null),
};
const doctorFields = {
  name: nameSchema,
  address: textSchema,
  specialty: z.string().trim().min(1).max(150),
  qualification: z.string().trim().min(1).max(150),
};
export const createDoctorBodySchema = z.object({
  routeId: objectIdSchema,
  ...doctorFields,
  ...doctorExtras,
  email: emailSchema.nullish().transform((v) => v ?? null),
  /** Picked on a Google map. Omit to add the Doctor now and set the point later. */
  location: locationSchema.nullish().transform((v) => v ?? null),
});
const doctorChangeObject = z.object({
    routeId: objectIdSchema.optional(),
    name: nameSchema.optional(),
    address: textSchema.optional(),
    specialty: doctorFields.specialty.optional(),
    qualification: doctorFields.qualification.optional(),
    /** `null` clears. */
    dateOfBirth: dateOnly.nullable().optional(),
    anniversary: dateOnly.nullable().optional(),
    visitFrequency: frequencySchema.nullable().optional(),
    clinicName: z.string().trim().max(150).nullable().optional(),
    phone: mobileSchema.nullable().optional(),
    /** `null` clears it. */
    email: emailSchema.nullable().optional(),
    /** `null` clears the registered location. */
    location: locationSchema.nullable().optional(),
    status: statusSchema.optional(),
});
const nothingToChange = (b: object) => Object.keys(b).length > 0;
export const updateDoctorBodySchema = doctorChangeObject.refine(nothingToChange, { message: 'Nothing to change.' });
/** A manager (or Admin) correcting a doctor that is waiting for approval: any detail but the status. */
export const reviewDoctorBodySchema = doctorChangeObject.omit({ status: true }).refine(nothingToChange, { message: 'Nothing to change.' });
/** Manager/Admin: only the visit target and the two dates. */
export const updateDoctorTargetsBodySchema = z
  .object({
    dateOfBirth: dateOnly.nullable().optional(),
    anniversary: dateOnly.nullable().optional(),
    visitFrequency: frequencySchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listDoctorsQuerySchema = z.object({
  ...pageFields,
  /** Includes `pending` — the MR-added Doctors waiting for approval. */
  status: z.enum(DOCTOR_STATUSES).optional(),
  routeId: objectIdSchema.optional(),
});
/** An MR's own Doctors — active only, so no status filter. */
export const listAssignedDoctorsQuerySchema = z.object({
  page: pageFields.page,
  pageSize: pageFields.pageSize,
  search: pageFields.search,
  routeId: objectIdSchema.optional(),
});
export const teamDoctorsQuerySchema = listAssignedDoctorsQuerySchema.extend({ userId: objectIdSchema.optional() });
/** Admin: one employee's Doctors. */
export const employeeDoctorsQuerySchema = listAssignedDoctorsQuerySchema.extend({ userId: objectIdSchema });
export const assignDoctorBodySchema = z.object({ userId: objectIdSchema });
export const doctorAssignmentParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

// ---- Doctors an MR adds (offline-first, then approved)
const addedDoctorFields = {
  routeId: objectIdSchema,
  ...doctorFields,
  ...doctorExtras,
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
const distributorFields = {
  name: nameSchema,
  gstNumber: gstSchema,
  contactPerson: z.string().trim().min(1).max(150),
  mobile: mobileSchema,
  address: textSchema,
};
/** Each id stands for everything under it: a Zone all its HQs, an HQ all its Routes. At least one of the three is needed (checked in the use case). */
const zoneIdsSchema = z.array(objectIdSchema).max(100);
const hqIdsSchema = z.array(objectIdSchema).max(500);
const routeIdsSchema = z.array(objectIdSchema).max(1000);
export const createDistributorBodySchema = z
  .object({
    zoneIds: zoneIdsSchema.default([]),
    hqIds: hqIdsSchema.default([]),
    routeIds: routeIdsSchema.default([]),
    ...distributorFields,
    /** Picked on a Google map. Omit to add the Distributor now and set the point later. */
    location: locationSchema.nullish().transform((v) => v ?? null),
    /** Any active field employees, of any designation. */
    assignedUserIds: z.array(objectIdSchema).max(100).default([]),
    /** What the distributor owed before this system, in paise; `0` if nothing. */
    openingDuesPaise: paiseSchema.default(0),
  })
  .refine((b) => b.zoneIds.length + b.hqIds.length + b.routeIds.length > 0, { message: 'Choose at least one zone, HQ or route.', path: ['zoneIds'] });
export const updateDistributorBodySchema = z
  .object({
    zoneIds: zoneIdsSchema.optional(),
    hqIds: hqIdsSchema.optional(),
    routeIds: routeIdsSchema.optional(),
    name: nameSchema.optional(),
    gstNumber: gstSchema.optional(),
    contactPerson: distributorFields.contactPerson.optional(),
    mobile: mobileSchema.optional(),
    address: textSchema.optional(),
    /** `null` clears the registered location. */
    location: locationSchema.nullable().optional(),
    /** The whole new list; `[]` un-assigns everyone. */
    assignedUserIds: z.array(objectIdSchema).max(100).optional(),
    openingDuesPaise: paiseSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change.' });
export const listDistributorsQuerySchema = z.object({
  ...pageFields,
  routeId: objectIdSchema.optional(),
  /** Zone and HQ narrow by territory; the most specific one given is used. */
  hqId: objectIdSchema.optional(),
  zoneId: objectIdSchema.optional(),
  assignedUserId: objectIdSchema.optional(),
});

export const distributorDocumentBodySchema = z.object({ documentType: z.enum(DISTRIBUTOR_DOCUMENT_TYPES) });
export const distributorDocumentParamsSchema = z.object({ id: objectIdSchema, documentId: z.string().min(1) });

// ---- Doctor sample allocations
const quantitySchema = z.number().int().min(1).max(100_000);
export const issueSampleBodySchema = z.object({ productId: objectIdSchema, quantity: quantitySchema });
export const adjustSampleBodySchema = z.object({ quantityAllocated: z.number().int().min(0).max(100_000) });
export const sampleAllocationParamsSchema = z.object({ id: objectIdSchema, productId: objectIdSchema });
