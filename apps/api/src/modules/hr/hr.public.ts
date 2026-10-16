/** One leave on a team calendar. `status` is where it stands: still waiting on the manager, or past them. */
export interface TeamLeave {
  leaveId: string;
  userId: string;
  leaveType: string | null;
  startDate: string;
  endDate: string;
  half: 'FIRST' | 'SECOND' | null;
  daysCount: number;
  status: 'SUBMITTED' | 'MANAGER_APPROVED' | 'APPROVED';
}

/** One day covered by a live leave, with whether it is paid (an unpaid day is deducted by payroll once the leave is fully approved). */
export interface LeaveDay {
  date: string;
  /** 1 for a whole day, 0.5 for a half. */
  portion: number;
  paid: boolean;
  leaveType: string | null;
  status: 'MANAGER_APPROVED' | 'APPROVED';
}

/**
 * The only thing another module may import from `hr/`. Dates are calendar days (`YYYY-MM-DD`).
 */
export interface HrPublicContract {
  /** How many holidays are scoped to these Zones or HQs: what a permanent territory delete would leave pointing at nothing. */
  countHolidaysScopedTo(scope: { zoneIds: string[]; hqIds: string[] }): Promise<number>;
  /** Phase 6's missed-DCR job (PRD §7.5): does a Manager-Approved (or fully approved) leave cover this day? */
  isOnLeave(userId: string, date: string): Promise<boolean>;
  /** The days in a range covered by a Manager-Approved (or fully approved) leave, sorted — `isOnLeave` for a whole calendar at once. */
  listLeaveDates(userId: string, from: string, to: string): Promise<string[]>;
  /** The days in a range covered by a Manager-Approved (or fully approved) leave, each with whether it is paid: for a review that must say why a day has no work. */
  listLeaveDays(userId: string, from: string, to: string): Promise<LeaveDay[]>;
  /** These people's live leaves (waiting, manager-approved, approved) touching a date range, oldest start first — a manager's team calendar. */
  listLeavesForUsers(userIds: string[], from: string, to: string): Promise<TeamLeave[]>;
  /** Phase 7's Payroll: approved unpaid-leave days falling in this month (`YYYY-MM`). */
  getUnpaidLeaveDays(userId: string, month: string): Promise<number>;
  /** The days in a range that are not working days for this employee: their weekly off day and the holidays that apply. */
  listOffDates(userId: string, from: string, to: string): Promise<string[]>;
  /** The holidays that apply to this employee in a date range (National, their HQ's, its Zone's). */
  listHolidayDates(userId: string, from: string, to: string): Promise<string[]>;
}
