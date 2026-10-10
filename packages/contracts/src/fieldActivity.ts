import type { GeofenceReason, GeofenceStatus, GeoPoint } from './geofence.js';
import type { DcrStatusName, DoctorServiceType, WorkingType } from './sync.js';

export type ExpensePaymentStatus = 'UNPAID' | 'PAID';

export type ExpenseTypeDto = 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';

/**
 * One row of `GET /field-activity/expenses` (Accountant audit) — a bare array, capped at 500. These are expenses whose daily
 * report is past the manager and has not been sent back. Money is integer paise.
 */
export interface ExpenseAuditRowDto {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  /** The day of the report, `YYYY-MM-DD`. */
  reportDate: string;
  type: ExpenseTypeDto;
  /** `AUTO` is the server's TA and DA; `MANUAL` is what the MR claimed. */
  source: 'AUTO' | 'MANUAL';
  amountPaise: number;
  remarks: string | null;
  paymentStatus: ExpensePaymentStatus | 'CANCELLED';
  /** AUTO TA only: a Route's distance could not be calculated, so the amount is artificially low. */
  distanceFlag: boolean;
  routeId: string | null;
  paidBy: string | null;
  paidAt: string | null;
}

/** What `POST /field-activity/expenses/:id/mark-paid` returns: the expense as it now stands. */
export interface MarkedPaidDto {
  id: string;
  paymentStatus: ExpensePaymentStatus | 'CANCELLED';
  paidBy: string | null;
  paidAt: string | null;
}

// ── The daily report under review (`GET /field-activity/dcr/:id`) ──────────────────────────
// Dates are ISO strings on the wire; money is integer paise.

/** The server's geofence answer for a call. `OVERRIDE` is a manager or Admin accepting a flagged call. */
export interface GeofenceOutcomeDto {
  status: GeofenceStatus;
  distanceMeters: number | null;
  reason: GeofenceReason | null;
  overriddenBy: string | null;
  overriddenAt: string | null;
  overrideComment: string | null;
}

interface CallBaseDto {
  id: string;
  dcrId: string;
  userId: string;
  reportDate: string;
  workingType: WorkingType;
  /** Accompanying colleagues' user ids. */
  workWith: string[];
  remarks: string | null;
  /** The phone's GPS at the call. */
  capturedLocation: GeoPoint | null;
  accuracyMeters: number | null;
  geofence: GeofenceOutcomeDto;
  recordedAt: string;
}

export interface DoctorCallDto extends CallBaseDto {
  doctorId: string;
  doctorName: string;
  /** The day's approved plan lists doctors and this one wasn't among them. */
  notInPlan: boolean;
  samples: { allocationId: string; productId: string; productName: string; quantity: number }[];
}

export interface ChemistCallDto extends CallBaseDto {
  chemistId: string;
  chemistName: string;
}

export interface FollowupDto {
  id: string;
  subject: 'DOCTOR' | 'CHEMIST';
  subjectId: string;
  subjectName: string;
  remarks: string;
  recordedAt: string;
}

export interface DcrExpenseDto {
  id: string;
  type: ExpenseTypeDto;
  /** `AUTO` is the server's TA and DA; `MANUAL` is what the MR claimed. */
  source: 'AUTO' | 'MANUAL';
  amountPaise: number;
  remarks: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'CANCELLED';
  /** The manager has accepted the claim. */
  accepted: boolean;
  /** AUTO TA only: a Route's distance could not be calculated, so the amount is artificially low. */
  distanceFlag: boolean;
  routeId: string | null;
}

export interface DcrDetailDto {
  id: string;
  userId: string;
  reportDate: string;
  status: DcrStatusName;
  approval: { requestId: string; cycle: number; submittedAt: string; decidedAt: string | null } | null;
  doctorCalls: DoctorCallDto[];
  chemistCalls: ChemistCallDto[];
  followups: FollowupDto[];
  expenses: DcrExpenseDto[];
}

/** Body of `POST /field-activity/dcr/:id/calls/:callId/override-geofence`. A reason is required. */
export interface OverrideGeofenceDto {
  comment: string;
}

// ── Doctor Service (`GET /field-activity/doctor-services/:id`) ─────────────────────────────

export interface DoctorServiceDto {
  id: string;
  doctorId: string;
  doctorName: string;
  /** The MR it is tied to. */
  userId: string;
  createdBy: string;
  origin: 'MR' | 'ADMIN';
  serviceType: DoctorServiceType;
  amountPaise: number;
  remarks: string | null;
  createdAt: string;
  /** `APPROVED` for an Admin-made one, otherwise its request's status. */
  status: string;
  approval: { requestId: string; cycle: number } | null;
}

/** TA, DA and the manual reimbursements (travel, meals, other) apart, in whole paise, and how many expenses. */
export interface ExpenseBucketDto {
  taPaise: number;
  daPaise: number;
  reimbursementPaise: number;
  count: number;
}

export interface ExpensePayoutRowDto {
  userId: string;
  userName: string;
  employeeCode: string;
  unpaid: ExpenseBucketDto;
  paid: ExpenseBucketDto;
  /** The latest time one of this month's expenses was paid; null if none was. */
  lastPaidAt: string | null;
}

/**
 * `GET /field-activity/expense-payouts?month=YYYY-MM`: the month's accepted expenses per employee. A month is the month the expense
 * was incurred (its report day). `dueDate` is `EXPENSE_PAYOUT_DAY` of the next month; `overdue` is only a flag.
 */
export interface ExpensePayoutSheetDto {
  month: string;
  dueDate: string;
  overdue: boolean;
  rows: ExpensePayoutRowDto[];
}

/** `POST /field-activity/expense-payouts/pay`: omit `userIds` to pay everyone who is owed. */
export interface PayExpensesDto {
  month: string;
  userIds?: string[] | undefined;
}
export interface PayOutcomeDto {
  userId: string;
  paidCount: number;
  paidPaise: number;
}

/** A gift Admin allocated to a Doctor: the assigned MR marks it done once delivered. No approval. */
export interface DoctorGiftDto {
  id: string;
  doctorId: string;
  doctorName: string;
  allocatedBy: string;
  productName: string;
  amountPaise: number;
  status: 'PENDING' | 'DONE';
  completedBy: string | null;
  completedAt: string | null;
  allocatedAt: string;
}
export interface AllocateGiftDto {
  doctorId: string;
  productName: string;
  amountPaise: number;
}
/** Admin makes a Doctor Service directly: effective at once, tied to the Doctor's assigned MR, with no approval. */
export interface CreateAdminServiceDto {
  doctorId: string;
  serviceType: DoctorServiceType;
  amountPaise: number;
  remarks?: string | null | undefined;
}

// ---- Monthly expense statement (decision-log 2026-10-10) ----------------------------------------

export type ExpenseMonthStatusDto = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ExpenseDayLineDto {
  date: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** The employee's own entries for the day. */
  others: Array<{ id: string; amountPaise: number; remarks: string | null }>;
}
export interface ExpenseTotalsDto {
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
}
/** One employee's month: date-wise TA, DA and Other, and where it stands in approval. */
export interface ExpenseStatementDto {
  userId: string;
  month: string;
  status: ExpenseMonthStatusDto;
  requestId: string | null;
  /** The month is over, so it can be submitted and approved. */
  monthEnded: boolean;
  editable: boolean;
  canSubmit: boolean;
  days: ExpenseDayLineDto[];
  totals: ExpenseTotalsDto;
  /** What was sent to the approver; differs from `totals` if TA/DA changed after the send. */
  submittedTotals: ExpenseTotalsDto | null;
  paidPaise: number;
}
export interface ExpenseMonthSummaryDto {
  month: string;
  status: ExpenseMonthStatusDto;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  paidPaise: number;
}
export interface OtherExpenseInputDto {
  reportDate: string;
  amountPaise: number;
  remarks: string | null;
}
