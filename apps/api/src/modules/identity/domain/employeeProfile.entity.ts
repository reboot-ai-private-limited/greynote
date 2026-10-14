export interface Address {
  /** House / street. Optional: addresses saved before the onboarding wizard carry none. */
  line1?: string | null;
  line2?: string | null;
  district: string;
  state: string;
  pincode: string;
  /** Defaults to 'India' at the DTO layer — domain just stores whatever it's given. */
  country: string;
}

export interface Qualification {
  /** Degree or qualification: HS, BSc, B.Tech, Diploma, PhD … */
  degree: string;
  /** Board, university or institute. */
  institute: string;
  yearOfPassing: number;
}

export interface PreviousEmployment {
  companyName: string;
  joiningDate: Date;
  /** Null: still there, or not known. */
  endDate: Date | null;
}

export interface BankDetails {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

/** The employee's profile picture. `publicId` is the Cloudinary id, used to delete it; never sent to a client. */
export interface ProfilePhoto {
  url: string;
  publicId: string;
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
  /** Whether the employee is on probation. Off by default: set at onboarding, because the software is new, not the employees. */
  onProbation: boolean;
  /** Months of probation from `dateOfJoining`, used only while `onProbation`. Null: use the `PROBATION_MONTHS` setting. 0: none. */
  probationMonths: number | null;
  /** The ESI insurance number: exactly 17 digits. Optional; printed on the salary slip. */
  esiNumber: string | null;
  /** The EPF member id (free text, up to 30 characters). Optional; printed on the salary slip. */
  epfNumber: string | null;
  /**
   * A copy of the employee's CURRENT HQ and its zone, kept here so the employee list needs no Territory read. Territory
   * owns the real assignment (with history) and writes this through `recordUserTerritory` whenever the HQ is set; a zone
   * never changes for an HQ, so only a change of HQ moves it. Null until an HQ is set.
   */
  hqId: string | null;
  zoneId: string | null;
  mobileNumber: string | null;
  alternateMobile: string | null;
  guardianName: string | null;
  dateOfBirth: Date | null;
  address: Address | null;
  /** Null until the wizard (or an edit) sets it. Equal to `address` when `permanentSameAsPresent`. */
  permanentAddress: Address | null;
  permanentSameAsPresent: boolean;
  /** Legacy free text from before `qualifications`; kept readable, no longer written by the wizard. */
  qualification: string | null;
  qualifications: Qualification[];
  previousEmployment: PreviousEmployment[];
  bankDetails: BankDetails | null;
  documents: UserDocument[];
  /** Optional profile picture (FIELD employees). Not needed for activation. */
  photo?: ProfilePhoto | null;
}
