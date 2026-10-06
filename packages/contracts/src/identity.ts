/** One row of `GET /identity/devices/pending` — a bare array, oldest request first. */
export interface PendingDeviceDto {
  id: string;
  userId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  status: string;
  requestedAt: string;
  employeeCode: string | null;
  employeeName: string | null;
}

export type UserListStatus = 'active' | 'pending' | 'inactive';

/** One row of `GET /identity/users`. */
export interface UserListItemDto {
  id: string;
  employeeCode: string;
  name: string;
  role: 'ADMIN' | 'HR' | 'ACCOUNTANT' | 'FIELD';
  designationId: string | null;
  managerId: string | null;
  status: UserListStatus;
}

export const DESIGNATION_NAMES = ['MR', 'ASM', 'RSM', 'ZSM', 'NSM'] as const;
export type DesignationName = (typeof DESIGNATION_NAMES)[number];

/** One row of `GET /identity/designations` — a bare array, not paginated. `level` is the rank in the reporting chain (MR 1 … NSM 5), fixed by the name. */
export interface DesignationDto {
  id: string;
  name: DesignationName;
  level: number;
}
/** The level is not sent: it follows from the name. */
export type CreateDesignationDto = Pick<DesignationDto, 'name'>;

/** One row of `GET /identity/pay-bands` — a bare array. Money is whole paise (₹1 = 100). */
export interface PayBandDto {
  id: string;
  /** Free text, up to 20 characters, unique ignoring case (G1, Trainee, Senior …). */
  name: string;
  taPerKmRatePaise: number;
  /** DA for a day worked in an HQ / Ex-station / Out-station Area. */
  hqDaPaise: number;
  exStationDaPaise: number;
  outStationDaPaise: number;
}
export type CreatePayBandDto = Omit<PayBandDto, 'id'>;
export type UpdatePayBandDto = Partial<CreatePayBandDto>;

/** Body of `POST /identity/users`. Admin may create any role; HR only FIELD. Everything else is set later by the onboarding PATCH. */
export interface CreateUserDto {
  role: UserListItemDto['role'];
  employeeCode: string;
  name: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface UserAddressDto {
  district: string;
  state: string;
  pincode: string;
  country: string;
}

export interface UserBankDetailsDto {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
}

export interface UserDocumentDto {
  id: string;
  type: string;
  url: string;
  publicId: string;
  uploadedAt: string;
}

/**
 * `GET /identity/users/:id` — the only place personal and bank details are returned.
 * `profile` is null for a non-FIELD user, or a FIELD user whose onboarding has not started.
 */
export interface UserDetailDto {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserListItemDto['role'];
  status: UserListStatus;
  isBlocked: boolean;
  lastLoginAt: string | null;
  currentBlock: { reason: string; blockedAt: string } | null;
  profile: {
    designationId: string | null;
    payBandId: string | null;
    managerId: string | null;
    dateOfJoining: string | null;
    /** Null: the probation length setting applies. 0: no probation. */
    probationMonths: number | null;
    /** Exactly 17 digits, or null. */
    esiNumber: string | null;
    mobileNumber: string | null;
    guardianName: string | null;
    dateOfBirth: string | null;
    address: UserAddressDto | null;
    qualification: string | null;
    bankDetails: UserBankDetailsDto | null;
    documents: UserDocumentDto[];
  } | null;
}

/** Body of `PATCH /identity/users/:id` — every section optional; an address or bank object is sent whole. */
export interface UpdateUserDto {
  basicDetails?: {
    name?: string;
    mobileNumber?: string;
    /** `null` clears the three optional fields (guardian, joining date, qualification); a missing key leaves them alone. */
    guardianName?: string | null;
    dateOfBirth?: string;
    dateOfJoining?: string | null;
    /** Whole months 0–36; `null` goes back to the setting. */
    probationMonths?: number | null;
    /** Exactly 17 digits; `null` clears it. */
    esiNumber?: string | null;
    qualification?: string | null;
    address?: UserAddressDto;
  };
  bankDetails?: Omit<UserBankDetailsDto, 'branchName'> & { branchName?: string };
  designationId?: string;
  payBandId?: string;
  managerId?: string;
  status?: 'inactive';
}

export const DEVICE_STATUSES = ['PENDING', 'REGISTERED', 'REJECTED', 'REMOVED'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** One row of `GET /identity/users/:id/devices` — every status, newest first. */
export interface UserDeviceDto {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
  status: DeviceStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** A rejected phone is blocked until this passes, then it counts as new. */
  expiresAt: string | null;
  /** A live session exists on this phone. Only a registered phone can be logged in. */
  loggedIn: boolean;
  lastActiveAt: string | null;
}

/** One line of the org-wide CTC formula (`GET /identity/pay-components`, a bare array in display order). */
export type PayComponentKind = 'EARNING' | 'EMPLOYER_CONTRIBUTION';

/** Percentages are whole basis points (1% = 100, so ESI 0.75% is `75`); money is annual whole paise. */
export type PayComponentRuleDto =
  | { type: 'PERCENT_OF_CTC'; basisPoints: number }
  | { type: 'PERCENT_OF_COMPONENTS'; basisPoints: number; of: string[] }
  | { type: 'FIXED'; amountPaise: number }
  | { type: 'BALANCER' };

export interface PayComponentDto {
  id: string;
  /** Upper-case and unique; what other components and an employee's overrides refer to. Fixed once created. */
  code: string;
  name: string;
  kind: PayComponentKind;
  rule: PayComponentRuleDto;
  order: number;
  isActive: boolean;
}
export type CreatePayComponentDto = Omit<PayComponentDto, 'id'>;
export type UpdatePayComponentDto = Partial<Omit<PayComponentDto, 'id' | 'code'>>;

/** One line of an employee's CTC breakdown, annual paise. */
export interface CtcLineDto {
  code: string;
  name: string;
  kind: PayComponentKind;
  amountPaise: number;
  /** HR typed this amount for this employee instead of taking the formula's. */
  isOverridden: boolean;
}

/** `POST /identity/ctc/preview` — the breakdown worked out, nothing saved. */
export interface PreviewCtcDto {
  ctcAnnualPaise: number;
  /** Component code → annual paise, for lines HR is overriding. */
  overrides?: Record<string, number>;
}
export interface CtcPreviewDto {
  ctcAnnualPaise: number;
  lines: CtcLineDto[];
  /** CTC less the employer's own EPF/ESI: what the employee is paid before any deduction. */
  grossAnnualPaise: number;
  grossMonthlyPaise: number;
}

/** One saved revision of an employee's CTC. Never edited; a change is a new revision. */
export interface CtcAssignmentDto {
  id: string;
  userId: string;
  ctcAnnualPaise: number;
  /** `YYYY-MM`, the first payroll month it applies to. */
  effectiveFrom: string;
  overrides: Record<string, number>;
  lines: CtcLineDto[];
  reason: string | null;
  createdBy: string;
  createdAt: string;
}
/** `POST /identity/users/:id/ctc`: the saved revision, and a warning (never a block) when it is far above the previous one. */
export interface AssignCtcResultDto extends CtcAssignmentDto {
  warning: string | null;
}
export interface AssignCtcDto {
  ctcAnnualPaise: number;
  effectiveFrom: string;
  overrides?: Record<string, number>;
  reason?: string | null;
}

/** `POST /identity/ctc/reapply` — fresh revisions from the current formula, one outcome per employee. */
export interface ReapplyCtcDto {
  effectiveFrom: string;
  reason?: string | null;
  userIds?: string[];
}
export type ReapplyOutcomeDto =
  | { userId: string; outcome: 'revised'; revisionId: string }
  | { userId: string; outcome: 'skipped'; message: string };

// ── Promotion (decision-log 2026-10-06) ─────────────────────────────────────────────────────

export const PROMOTION_STATUSES = ['SCHEDULED', 'APPLIED', 'CANCELLED'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/** A direct report and who they report to from the effective month. The promoted person's own id means "stays with them". */
export interface PromotionTeamMoveDto {
  userId: string;
  toManagerId: string;
}

/**
 * Body of `POST /identity/users/:id/promotions/preview` and `.../promotions`. A promotion takes effect on the 1st of
 * `effectiveFrom` (the next month at the earliest). An omitted or null `to*` field is left as it is; every current direct report
 * must appear in `teamMoves`, or the promotion cannot be scheduled.
 */
export interface PromotionRequestDto {
  effectiveFrom: string;
  toDesignationId?: string | null;
  toPayBandId?: string | null;
  /** The promoted person's own new manager. */
  toManagerId?: string | null;
  /** A new CTC from the same month; it need not sit in any range. */
  ctc?: { ctcAnnualPaise: number; overrides?: Record<string, number> } | null;
  teamMoves: PromotionTeamMoveDto[];
  reason?: string | null;
}

export interface PromotionPersonDto {
  id: string;
  name: string;
  employeeCode: string;
  designation: DesignationName | null;
}

/** Designation, grade and manager at one moment. */
export interface PromotionPositionDto {
  designation: DesignationName | null;
  payBand: { id: string; name: string } | null;
  manager: PromotionPersonDto | null;
}

export interface PromotionTeamRowDto {
  person: PromotionPersonDto;
  toManager: PromotionPersonDto | null;
  /** Stays with the promoted person. */
  stays: boolean;
}

export interface PromotionProblemDto {
  field: string;
  message: string;
}

/** `POST .../promotions/preview`: what would change, without saving. Scheduling is allowed only when `problems` is empty. */
export interface PromotionPreviewDto {
  employee: PromotionPersonDto;
  effectiveFrom: string;
  /** The earliest month a promotion can start from now. */
  earliestMonth: string;
  from: PromotionPositionDto;
  /** What it becomes: a field the request leaves alone shows its current value. */
  to: PromotionPositionDto;
  team: PromotionTeamRowDto[];
  ctc: { previousAnnualPaise: number | null; newAnnualPaise: number; lines: CtcLineDto[] } | null;
  warnings: string[];
  problems: PromotionProblemDto[];
  canSchedule: boolean;
}

/** One promotion, as kept: `GET .../promotions`, newest first. */
export interface PromotionDto {
  id: string;
  userId: string;
  effectiveFrom: string;
  status: PromotionStatus;
  from: PromotionPositionDto;
  to: PromotionPositionDto;
  ctcAnnualPaise: number | null;
  team: PromotionTeamRowDto[];
  reason: string | null;
  createdBy: string;
  createdAt: string;
  appliedAt: string | null;
  cancelledAt: string | null;
}
