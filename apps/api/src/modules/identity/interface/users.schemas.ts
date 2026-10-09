import { z } from 'zod';
import { paginationQuerySchema } from '@/shared/http/pagination.js';
import { passwordSchema } from './password.schema.js';

export const addressSchema = z.object({
  line1: z.string().min(1).nullable().optional(),
  line2: z.string().min(1).nullable().optional(),
  district: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().min(1),
  country: z.string().min(1).default('India'),
});

export const bankDetailsSchema = z.object({
  bankName: z.string().min(1),
  ifsc: z.string().min(1),
  accountNumber: z.string().min(1),
  accountHolderName: z.string().min(1),
  branchName: z.string().min(1).optional(),
});

/**
 * One shape now, for every role — decision 12's split was about who's ALLOWED to submit which
 * `role` value (enforced in `CreateUserUseCase`, not here), not a difference in fields.
 * `designationId`/`payBandId`/`managerId` moved to `EmployeeProfile` and are only ever set via
 * the incremental onboarding PATCH below, never at creation.
 */
export const createUserBodySchema = z.object({
  role: z.enum(['ADMIN', 'HR', 'ACCOUNTANT', 'FIELD']),
  employeeCode: z.string().min(1),
  name: z.string().min(1),
  password: passwordSchema,
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
});

const basicDetailsPatchSchema = z.object({
  name: z.string().min(1).optional(),
  mobileNumber: z.string().min(1).optional(),
  alternateMobile: z.string().min(1).nullable().optional(),
  // `null` clears an optional field; a missing key leaves it alone.
  guardianName: z.string().min(1).nullable().optional(),
  // A string first: `z.coerce.date()` alone turns `null` into 1 January 1970 instead of refusing it.
  dateOfBirth: z.string().min(1).pipe(z.coerce.date()).optional(),
  dateOfJoining: z.coerce.date().nullable().optional(),
  /** Whole months, 0 (none) to 36; `null` goes back to the `PROBATION_MONTHS` setting. */
  probationMonths: z.number().int().min(0).max(36).nullable().optional(),
  qualification: z.string().min(1).nullable().optional(),
  /** Exactly 17 digits (the ESI insurance number); `null` clears it. */
  esiNumber: z.string().regex(/^\d{17}$/, 'The ESI number is exactly 17 digits.').nullable().optional(),
  address: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  permanentSameAsPresent: z.boolean().optional(),
  qualifications: z
    .array(z.object({ degree: z.string().min(1), institute: z.string().min(1), yearOfPassing: z.number().int().min(1950).max(2100) }))
    .max(20)
    .optional(),
  previousEmployment: z
    .array(z.object({ companyName: z.string().min(1), joiningDate: z.coerce.date(), endDate: z.coerce.date().nullable() }))
    .max(30)
    .optional(),
});

/** Every section optional — the incremental-onboarding PATCH (decision 13). */
export const updateUserBodySchema = z.object({
  basicDetails: basicDetailsPatchSchema.optional(),
  bankDetails: bankDetailsSchema.optional(),
  designationId: z.string().min(1).optional(),
  payBandId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  status: z.literal('inactive').optional(),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.enum(['ADMIN', 'HR', 'ACCOUNTANT', 'FIELD']).optional(),
  designationId: z.string().min(1).optional(),
  managerId: z.string().min(1).optional(),
  status: z.enum(['active', 'pending', 'inactive']).optional(),
  isBlocked: z.coerce.boolean().optional(),
});

export const resetPasswordBodySchema = z.object({ newPassword: passwordSchema });

export const userIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const documentTypeBodySchema = z.object({
  documentType: z.string().min(1),
});

export const documentParamsSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
});
