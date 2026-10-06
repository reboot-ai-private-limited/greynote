import type { Paise } from '@/shared/money/paise.js';

/** Payroll's narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface IdentityPort {
  /** Every active FIELD employee's id. */
  listActiveFieldUserIds(): Promise<string[]>;
  /** Names and codes for a batch of employees, in one call. A missing id is left out. */
  getUserSummaries(userIds: string[]): Promise<Array<{ id: string; name: string; employeeCode: string }>>;
  findUserSummary(userId: string): Promise<{ id: string; name: string; role: string; status: 'active' | 'pending' | 'inactive' } | null>;
  /** The joining date and ESI number (`null` if not set); `null` without an EmployeeProfile. */
  getEmploymentDetails(userId: string): Promise<{ dateOfJoining: Date | null; esiNumber: string | null } | null>;
  /** The CTC revision in force for the month, with its frozen breakdown; `null` if none was assigned by then. */
  getCtcForMonth(userId: string, month: string): Promise<{ ctcAnnualPaise: Paise; effectiveFrom: string; lines: CtcLineSnapshot[] } | null>;
}

/** One line of an employee's CTC breakdown, annual paise. */
export interface CtcLineSnapshot {
  code: string;
  name: string;
  kind: 'EARNING' | 'EMPLOYER_CONTRIBUTION';
  amountPaise: Paise;
  isOverridden: boolean;
}

export interface HrPort {
  /** Approved unpaid-leave days in the month, halves allowed. */
  getUnpaidLeaveDays(userId: string, month: string): Promise<number>;
}
