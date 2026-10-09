import { z } from 'zod';

const text = z.string().trim().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const draftAddress = z.object({
  line1: text.optional(),
  line2: text.optional(),
  district: text.optional(),
  state: text.optional(),
  pincode: z.string().regex(/^\d{6}$/, 'The pincode is 6 digits.').optional(),
  country: text.optional(),
});

/**
 * Every field optional: a draft may be saved half-filled, so this checks only the shape of what IS
 * there. Whether the required ones are all present is checked when the employee is created.
 */
export const draftDataSchema = z
  .object({
    personal: z
      .object({
        name: text.optional(),
        mobileNumber: z.string().regex(/^\d{10}$/, 'The mobile number is 10 digits.').optional(),
        alternateMobile: z.string().regex(/^\d{10}$/, 'The mobile number is 10 digits.').optional(),
        guardianName: text.optional(),
        dateOfBirth: isoDate.optional(),
        esiNumber: z.string().regex(/^\d{17}$/, 'The ESI number is exactly 17 digits.').optional(),
        dateOfJoining: isoDate.optional(),
        probationMonths: z.number().int().min(0).max(36).optional(),
      })
      .optional(),
    address: z
      .object({
        present: draftAddress.optional(),
        permanent: draftAddress.optional(),
        permanentSameAsPresent: z.boolean().optional(),
      })
      .optional(),
    qualifications: z
      .array(
        z.object({
          degree: text.optional(),
          institute: text.optional(),
          yearOfPassing: z.number().int().min(1950).max(2100).optional(),
        }),
      )
      .max(20)
      .optional(),
    experience: z
      .array(z.object({ companyName: text.optional(), joiningDate: isoDate.optional(), endDate: isoDate.optional() }))
      .max(30)
      .optional(),
    bank: z
      .object({
        bankName: text.optional(),
        accountNumber: z.string().regex(/^\d{6,20}$/, 'The account number is 6 to 20 digits.').optional(),
        accountHolderName: text.optional(),
        ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'The IFSC code looks like SBIN0001234.').optional(),
        branchName: text.optional(),
      })
      .optional(),
    work: z.object({ designationId: text.optional(), hqId: text.optional(), managerId: text.optional() }).optional(),
    compensation: z
      .object({
        payBandId: text.optional(),
        ctcAnnualPaise: z.number().int().positive().optional(),
        effectiveFrom: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM.').optional(),
      })
      .optional(),
  })
  .strict();

export const employeeDraftBodySchema = z.object({
  step: z.number().int().min(1).max(8).optional(),
  data: draftDataSchema.optional(),
});

export const draftIdParamsSchema = z.object({ id: z.string().min(1) });
