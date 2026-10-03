/** One row of `GET /hr/leaves`. `status` is an approval status (SUBMITTED, APPROVED, …). */
export interface LeaveRequestDto {
  id: string;
  userId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  half: string | null;
  reason: string | null;
  status: string;
}

/** One counted day of a leave: weekly off days and holidays are left out, a half-day counts 0.5. */
export interface LeaveDayDto {
  date: string;
  portion: 1 | 0.5;
}

/** `GET /hr/leaves/:id`: the leave as it was counted when it was submitted. */
export interface LeaveDetailDto extends LeaveRequestDto {
  leaveTypeId: string;
  isPaid: boolean;
  /** The leave year (by its start year) both dates fall in. */
  year: number;
  days: LeaveDayDto[];
  daysCount: number;
  /** The approval behind it; `cycle` is the round a decision must name. */
  approval: { requestId: string; cycle: number; submittedAt: string; decidedAt: string | null } | null;
}

/** One row of `GET /hr/leave-balances/:userId`. `pendingDays` holds the open requests, so `availableDays` already counts them. */
export interface LeaveBalanceDto {
  id: string;
  userId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  year: number;
  allocatedDays: number;
  usedDays: number;
  pendingDays: number;
  availableDays: number;
}

// ── Masters (HR, Admin) ────────────────────────────────────────────────────────────────────

/** `isPaid` decides whether a type has a balance; it is fixed once the type is in use. An inactive type cannot be requested. */
export interface LeaveTypeDto {
  id: string;
  name: string;
  isPaid: boolean;
  active: boolean;
}
export interface CreateLeaveTypeDto {
  name: string;
  isPaid: boolean;
}
export interface UpdateLeaveTypeDto {
  name?: string;
  isPaid?: boolean;
  active?: boolean;
}

/** One cell of the Leave Master: a grade's default days per leave year for a paid type. */
export interface LeavePolicyDto {
  id: string;
  payBandId: string;
  leaveTypeId: string;
  /** Whole or half days. */
  defaultDays: number;
  updatedBy: string;
  updatedAt: string;
}

export const HOLIDAY_SCOPES = ['NATIONAL', 'ZONE', 'HQ'] as const;
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number];

export interface HolidayDto {
  id: string;
  name: string;
  /** `YYYY-MM-DD`. */
  date: string;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
  createdBy: string;
  createdAt: string;
}
export interface CreateHolidayDto {
  name: string;
  date: string;
  scope: HolidayScope;
  zoneIds: string[];
  hqIds: string[];
}

/** Body of `PATCH /hr/leave-balances/:userId/:leaveTypeId`. Never below what is used plus pending. */
export interface AdjustLeaveBalanceDto {
  year: number;
  allocatedDays: number;
  reason: string;
}
