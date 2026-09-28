/** The Leave Master: a grade's default days per leave year for one paid leave type. */
export interface LeavePolicy {
  id: string;
  payBandId: string;
  leaveTypeId: string;
  /** Whole or half days. */
  defaultDays: number;
  updatedBy: string;
  updatedAt: Date;
}
