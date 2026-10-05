export interface Address {
  district: string;
  state: string;
  pincode: string;
  /** Defaults to 'India' at the DTO layer — domain just stores whatever it's given. */
  country: string;
}

export interface BankDetails {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

export interface UserDocument {
  /**
   * Internal uuid v7, separate from Cloudinary's `publicId` — routing a DELETE by `publicId`
   * would break on Cloudinary public IDs that contain slashes (folder-style paths); routing by
   * our own opaque id doesn't.
   */
  id: string;
  type: string;
  url: string;
  publicId: string;
  uploadedAt: Date;
}

/**
 * The FIELD-only onboarding bundle — everything that only ever applies to a field employee, kept
 * off `User` so an ADMIN/HR/ACCOUNTANT record never carries a pile of always-null fields. One per
 * FIELD `User`, created lazily: it doesn't exist until the first onboarding `PATCH` sets
 * `basicDetails` or `bankDetails` (or a document is uploaded before either), and a FIELD user with
 * no row yet reads exactly like one with every field null (`domain/onboarding.ts`).
 *
 * `designationId`/`payBandId`/`managerId`/`dateOfJoining` live here, not on `User` — all four are
 * FIELD-only in practice already (`CreateUserInput`'s non-FIELD variant never carried them), and
 * grouping them with the rest of the onboarding data means `getManagerChain`/`getPayBandRates`
 * and the onboarding PATCH flow all read from one place.
 */
export interface EmployeeProfile {
  id: string;
  userId: string;
  designationId: string | null;
  payBandId: string | null;
  managerId: string | null;
  dateOfJoining: Date | null;
  /** Months of probation from `dateOfJoining`. Null: use the `PROBATION_MONTHS` setting. 0: no probation. */
  probationMonths: number | null;
  mobileNumber: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: Address | null;
  qualification: string | null;
  bankDetails: BankDetails | null;
  documents: UserDocument[];
}
