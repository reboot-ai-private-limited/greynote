import { z } from 'zod';
import { paginationQuerySchema } from '@/shared/http/pagination.js';
import { passwordSchema } from './password.schema.js';

export const addressSchema = z.object({
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
  guardianName: z.string().min(1).optional(),
  dateOfBirth: z.coerce.date().optional(),
  dateOfJoining: z.coerce.date().optional(),
  qualification: z.string().min(1).optional(),
  address: addressSchema.optional(),
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
