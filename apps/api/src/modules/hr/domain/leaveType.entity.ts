/**
 * A kind of leave. `isPaid` decides everything downstream: a paid type has a balance per leave
 * year; an unpaid one (Loss of Pay) has none and feeds Payroll's deduction. It's fixed once the
 * type is in use (a policy, balance or leave refers to it). An inactive type can't be requested.
 */
export interface LeaveType {
  id: string;
  name: string;
  isPaid: boolean;
  /** The employee may attach proof (a prescription, a medical certificate) to a leave of this type. Optional for them; never blocks a request. */
  allowsProof: boolean;
  active: boolean;
}

/** The starting list (sign-off F17) — HR renames or adds to it. */
export const DEFAULT_LEAVE_TYPES: Array<Pick<LeaveType, 'name' | 'isPaid' | 'allowsProof'>> = [
  { name: 'Casual', isPaid: true, allowsProof: false },
  { name: 'Sick', isPaid: true, allowsProof: true },
  { name: 'Earned', isPaid: true, allowsProof: false },
  { name: 'Loss of Pay', isPaid: false, allowsProof: false },
];
