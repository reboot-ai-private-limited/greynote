/**
 * A half-finished onboarding of a new field employee (the web wizard's "save draft"). It is not a
 * `User`: no login exists and no employee code is used up until the last step creates the real
 * records. Dates are `YYYY-MM-DD` strings here; they become `Date`s when the employee is created.
 */
import type { CtcStructure } from './ctcBreakdown.js';

export interface DraftAddress {
  line1?: string;
  line2?: string;
  district?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

export interface EmployeeDraftData {
  /** Set only by the photo endpoints (never by the Personal save), so saving the form can't drop it. */
  photo?: { url: string; publicId: string };
  personal?: {
    name?: string;
    mobileNumber?: string;
    alternateMobile?: string;
    guardianName?: string;
    dateOfBirth?: string;
    esiNumber?: string;
    epfNumber?: string;
    dateOfJoining?: string;
    onProbation?: boolean;
    probationMonths?: number;
  };
  address?: {
    present?: DraftAddress;
    permanent?: DraftAddress;
    permanentSameAsPresent?: boolean;
  };
  qualifications?: Array<{ degree?: string; institute?: string; yearOfPassing?: number }>;
  experience?: Array<{ companyName?: string; joiningDate?: string; endDate?: string }>;
  bank?: {
    bankName?: string;
    accountNumber?: string;
    accountHolderName?: string;
    ifsc?: string;
    branchName?: string;
  };
  work?: { designationId?: string; hqId?: string; managerId?: string; zoneIds?: string[]; hqIds?: string[]; routeIds?: string[] };
  compensation?: {
    payBandId?: string;
    ctcAnnualPaise?: number;
    /** `YYYY-MM`. Defaults to the month of joining, else this month. */
    effectiveFrom?: string;
    /** This employee's own Basic %, changed, removed and added lines (see `CtcStructure`). */
    structure?: CtcStructure;
  };
}

export interface EmployeeDraft {
  id: string;
  createdBy: string;
  /** The furthest step reached (1-based), so "continue" reopens there. */
  step: number;
  data: EmployeeDraftData;
  /** Set once the last step has created the login, so a retry after a later failure reuses it instead of creating a second. */
  createdUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DRAFT_STEPS = ['personal', 'address', 'qualifications', 'experience', 'bank', 'work', 'compensation'] as const;
export type DraftStep = (typeof DRAFT_STEPS)[number];

export interface DraftGap {
  step: DraftStep;
  field: string;
}

const blank = (value: string | undefined): boolean => !value || value.trim() === '';

function addressGaps(address: DraftAddress | undefined, prefix: string): DraftGap[] {
  const gaps: DraftGap[] = [];
  for (const field of ['line1', 'district', 'state', 'pincode'] as const) {
    if (blank(address?.[field])) gaps.push({ step: 'address', field: `${prefix}.${field}` });
  }
  return gaps;
}

/**
 * What the last step still lacks. Optional: alternate mobile, ESI number, joining date, probation,
 * address line 2, qualifications, experience, CTC amount. A manager is optional: with none,
 * approvals go straight to Admin/HR.
 */
export function draftGaps(data: EmployeeDraftData): DraftGap[] {
  const gaps: DraftGap[] = [];
  const need = (step: DraftStep, field: string, value: string | undefined) => {
    if (blank(value)) gaps.push({ step, field });
  };

  need('personal', 'name', data.personal?.name);
  need('personal', 'mobileNumber', data.personal?.mobileNumber);
  need('personal', 'guardianName', data.personal?.guardianName);
  need('personal', 'dateOfBirth', data.personal?.dateOfBirth);

  gaps.push(...addressGaps(data.address?.present, 'present'));
  if (!data.address?.permanentSameAsPresent) gaps.push(...addressGaps(data.address?.permanent, 'permanent'));

  need('bank', 'bankName', data.bank?.bankName);
  need('bank', 'accountNumber', data.bank?.accountNumber);
  need('bank', 'accountHolderName', data.bank?.accountHolderName);
  need('bank', 'ifsc', data.bank?.ifsc);
  need('bank', 'branchName', data.bank?.branchName);

  need('work', 'designationId', data.work?.designationId);
  // Which of Zone, HQ and routes are required depends on the designation, so that is checked when the draft is finalised.

  need('compensation', 'payBandId', data.compensation?.payBandId);

  // A started row must be whole: half a qualification or a job with no start date means nothing.
  data.qualifications?.forEach((row, index) => {
    if (blank(row.degree)) gaps.push({ step: 'qualifications', field: `${index}.degree` });
    if (blank(row.institute)) gaps.push({ step: 'qualifications', field: `${index}.institute` });
    if (!row.yearOfPassing) gaps.push({ step: 'qualifications', field: `${index}.yearOfPassing` });
  });
  data.experience?.forEach((row, index) => {
    if (blank(row.companyName)) gaps.push({ step: 'experience', field: `${index}.companyName` });
    if (blank(row.joiningDate)) gaps.push({ step: 'experience', field: `${index}.joiningDate` });
  });

  return gaps;
}
