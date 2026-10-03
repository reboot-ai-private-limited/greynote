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
