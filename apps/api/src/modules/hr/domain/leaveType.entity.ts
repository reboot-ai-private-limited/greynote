/**
 * A kind of leave. `isPaid` decides everything downstream: a paid type has a balance per leave
 * year; an unpaid one (Loss of Pay) has none and feeds Payroll's deduction. It's fixed once the
 * type is in use (a policy, balance or leave refers to it). An inactive type can't be requested.
 */
export interface LeaveType {
  id: string;
  name: string;
  isPaid: boolean;
  active: boolean;
}

/** The starting list (sign-off F17) — HR renames or adds to it. */
export const DEFAULT_LEAVE_TYPES: Array<Pick<LeaveType, 'name' | 'isPaid'>> = [
  { name: 'Casual', isPaid: true },
  { name: 'Sick', isPaid: true },
  { name: 'Earned', isPaid: true },
  { name: 'Loss of Pay', isPaid: false },
];
