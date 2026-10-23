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

/** HQ, Ex-station or Out-station: the kind of Route a record was made on. */
export type RecordRouteTypeDto = 'HQ' | 'EX_STATION' | 'OUT_STATION';

interface CallBaseDto {
  id: string;
  dcrId: string;
  userId: string;
  reportDate: string;
  /** The day's plan type, stamped by the server. */
  workingType: WorkingType;
  /** The Doctor's or Chemist's Route and its type, stamped by the server. */
  routeId: string | null;
  routeType: RecordRouteTypeDto | null;
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
  /** The Doctor's Route isn't one the day's plan lists. */
  routeNotInPlan: boolean;
  samples: { allocationId: string; productId: string; productName: string; quantity: number }[];
}

export interface ChemistCallDto extends CallBaseDto {
  chemistId: string;
  chemistName: string;
  /** The Chemist's Route isn't one the day's plan lists. */
  routeNotInPlan: boolean;
}

export interface FollowupDto {
  id: string;
  subject: 'DOCTOR' | 'CHEMIST';
  subjectId: string;
  subjectName: string;
  remarks: string;
  /** `null` on follow-ups from before the work type, route type and GPS were recorded. */
  workingType: WorkingType | null;
  routeId: string | null;
  routeType: RecordRouteTypeDto | null;
  /** A Doctor not on the day's list, or a Chemist whose Route the plan doesn't list. */
  notInPlan: boolean;
  geofence: GeofenceOutcomeDto | null;
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
  /** The employee's note on the day (required on a meeting or conference day). */
  remarks: string | null;
  doctorCalls: DoctorCallDto[];
  chemistCalls: ChemistCallDto[];
  followups: FollowupDto[];
  expenses: DcrExpenseDto[];
}

/** One row of `GET /field-activity/dcr`: the day and where its approval is, without the calls. */
export type DcrSummaryDto = Pick<DcrDetailDto, 'id' | 'userId' | 'reportDate' | 'status' | 'approval' | 'remarks'>;

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
  /** Admin or Accounts marked it carried out — the last step, after approval. */
  doneBy: string | null;
  doneAt: string | null;
  /** Approved and not yet marked done. */
  awaitingDone: boolean;
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
  /** The end of the day the month must be sent / approved by (ISO instants); after it only an exception lets it through (decision-log 2026-10-12). */
  deadlines: { submitBy: string; approveBy: string };
  /** The open exception for each deadline: when it ends (ISO), or null. */
  exceptions: { submitUntil: string | null; approveUntil: string | null };
  /** The send deadline has passed with no exception: the employee can no longer submit. */
  submitLate: boolean;
  /** When the Accountant finalized the month (ISO): its amounts are locked and it can be paid. Null before. */
  finalizedAt: string | null;
}

// ---- Expense review (Admin, HR, Accountant) — decision-log 2026-10-13 ----------------------------

/** Where a month stands for the people who run it: the employee's own status, then Finalized (locked, payable) and Paid. */
export type ExpenseStageDto = ExpenseMonthStatusDto | 'NOT_SUBMITTED' | 'FINALIZED' | 'PAID';

/** The Accountant (or Admin) finalizes months: only an approved month can be, and it locks the amounts and makes the month payable. */
export interface FinalizeExpensesDto {
  month: string;
  /** Omitted: every approved, not yet finalized month. */
  userIds?: string[] | undefined;
}
export type FinalizeResultDto = 'FINALIZED' | 'ALREADY_FINALIZED' | 'NOT_APPROVED';
export interface FinalizeOutcomeDto {
  userId: string;
  result: FinalizeResultDto;
}

/** What a calendar day is for this employee: a working day, or why it is not (leave wins over a holiday, a holiday over the weekly off). */
export type ReviewDayTypeDto = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY' | 'LEAVE';
/** The kind of Route a day was on; it decides DA. */
export type ReviewStationDto = 'HQ' | 'EX_STATION' | 'OUT_STATION';
/** The day's daily report: not sent (none, a draft, or taken back), waiting on a manager, or decided. */
export type ReviewDcrStateDto = 'NOT_SUBMITTED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

/** One expense row of a day, as the reviewer can change it. */
export interface ExpenseReviewRowDto {
  id: string;
  type: 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';
  amountPaise: number;
  /** What the row first held, if HR has changed it (0 for a row HR added); null if never adjusted. */
  originalAmountPaise: number | null;
  source: 'AUTO' | 'MANUAL';
  remarks: string | null;
  /** Paid rows cannot be changed. */
  paid: boolean;
}
/** One change HR or Admin made to a day's amount: before, after, why, who and when. */
export interface ExpenseAdjustmentDto {
  id: string;
  expenseId: string;
  type: ExpenseReviewRowDto['type'];
  kind: 'EDIT' | 'ADD';
  beforePaise: number;
  afterPaise: number;
  reason: string;
  by: { id: string; name: string; role: string };
  at: string;
}
/** HR changes one row's amount (up or down, to zero allowed); the reason is required. */
export interface AdjustExpenseRowDto {
  amountPaise: number;
  reason: string;
}
/** HR puts a TA or DA amount on a day that had none. */
export interface AddExpenseRowDto {
  userId: string;
  date: string;
  type: 'TA' | 'DA';
  amountPaise: number;
  reason: string;
}

export interface ExpenseReviewDayDto {
  date: string;
  dayType: ReviewDayTypeDto;
  /** A leave day: paid or unpaid (an unpaid day is deducted by payroll), whole or half. */
  leave: { paid: boolean; portion: number; leaveType: string | null } | null;
  /** From the day's Daily Plan; null with no plan. */
  workingType: 'FIELD_WORK' | 'DOCTOR_CAMPAIGN' | 'MEETING' | 'CONFERENCE' | 'STRIKE' | null;
  /** An out-station trip's stay or transit day; `NORMAL` otherwise. */
  dayKind: 'NORMAL' | 'STAY' | 'TRANSIT' | null;
  /** The farthest of the day's Routes (out-station over ex-station over HQ); null with no route. */
  station: ReviewStationDto | null;
  routes: Array<{ id: string; name: string; routeType: ReviewStationDto }>;
  dcr: ReviewDcrStateDto;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** The day's TA and DA are payable: its report was approved. `false` (a report not approved, or rejected) means they are claimed but not counted; null with no TA or DA. */
  taDaAccepted: boolean | null;
  /** TA could not be worked out for a route (its distance failed), so the amount is artificially low. */
  distanceFlag: boolean;
  others: Array<{ id: string; amountPaise: number; remarks: string | null }>;
  /** Every row of the day, with its first amount if HR changed it. */
  rows: ExpenseReviewRowDto[];
  /** What HR changed on this day, oldest first. */
  adjustments: ExpenseAdjustmentDto[];
}

/** One employee's month, day by day (every calendar day to today), with the statement's totals and status. */
export interface ExpenseReviewDto {
  userId: string;
  userName: string;
  employeeCode: string;
  month: string;
  status: ExpenseMonthStatusDto;
  stage: ExpenseStageDto;
  /** Finalized: the amounts are locked, nobody can change them. */
  finalizedAt: string | null;
  finalizedBy: string | null;
  /** Everything claimed in the month. */
  totals: ExpenseTotalsDto;
  /** The part of `totals` that is payable (its report is approved); the month table's `acceptedPaise`. */
  acceptedPaise: number;
  submittedTotals: ExpenseTotalsDto | null;
  paidPaise: number;
  deadlines: { submitBy: string; approveBy: string };
  exceptions: { submitUntil: string | null; approveUntil: string | null };
  leave: { paidDays: number; unpaidDays: number };
  days: ExpenseReviewDayDto[];
}

/** One employee's row of the month table: everything claimed, with how much of it is accepted (its report is approved) and how much is paid. */
export interface ExpenseOverviewRowDto {
  userId: string;
  userName: string;
  employeeCode: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  /** The part of `totalPaise` whose report is approved: what a payout can pay. */
  acceptedPaise: number;
  paidPaise: number;
  status: ExpenseMonthStatusDto | 'NOT_SUBMITTED';
  /** `status`, or Finalized / Paid once the Accountant has finalized the month. */
  stage: ExpenseStageDto;
  finalizedAt: string | null;
  /**
   * The step whose deadline has passed with nothing yet allowed to get past it: `SUBMIT` (the employee has not sent the month, or it was sent
   * back) or `APPROVE` (it waits on the manager). Admin can allow it late; null when no deadline is in the way.
   */
  lateNeeded: 'SUBMIT' | 'APPROVE' | null;
  /** An exception that is open now: the phase it covers and when it ends (ISO). */
  lateGrant: { phase: 'SUBMIT' | 'APPROVE'; until: string } | null;
  /** The month was sent (even if it is back with the employee since). */
  submittedAt: string | null;
  /** AUTO TA rows whose distance failed. */
  flaggedRows: number;
}
export interface ExpenseOverviewDto {
  month: string;
  /** The end of the day the month must be sent / approved by (ISO instants). */
  deadlines: { submitBy: string; approveBy: string };
  /** The day the month's expenses should be paid by (`EXPENSE_PAYOUT_DAY` of the next month). */
  payoutDueDate: string;
  rows: ExpenseOverviewRowDto[];
}

export type ExpenseGrantPhaseDto = 'SUBMIT' | 'APPROVE';
export type ExpenseGrantStatusDto = 'OPEN' | 'USED' | 'REVOKED' | 'EXPIRED';
/** A one-off exception that lets a month of expenses be sent or approved after its deadline. */
export interface ExpenseMonthGrantDto {
  id: string;
  userId: string;
  month: string;
  phase: ExpenseGrantPhaseDto;
  reason: string;
  grantedBy: string;
  grantedByRole: string;
  grantedAt: string;
  expiresAt: string;
  status: ExpenseGrantStatusDto;
  /** `OPEN` past `expiresAt` reads as `EXPIRED` here. */
  effectiveStatus: ExpenseGrantStatusDto;
  usedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
}
/** `POST /field-activity/expense-grants`. `expiresAt` (ISO date-time) left out: the default length applies. */
export interface GrantExpenseMonthDto {
  userId: string;
  month: string;
  phase: ExpenseGrantPhaseDto;
  reason: string;
  expiresAt?: string;
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
