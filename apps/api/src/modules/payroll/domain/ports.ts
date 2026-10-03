import type { Paise } from '@/shared/money/paise.js';

/** Payroll's narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface IdentityPort {
  /** Every active FIELD employee's id. */
  listActiveFieldUserIds(): Promise<string[]>;
  /** Names and codes for a batch of employees, in one call. A missing id is left out. */
  getUserSummaries(userIds: string[]): Promise<Array<{ id: string; name: string; employeeCode: string }>>;
  findUserSummary(userId: string): Promise<{ id: string; name: string; role: string; status: 'active' | 'pending' | 'inactive' } | null>;
  /** The Pay Band id (`null` if none) and joining date; `null` without an EmployeeProfile. */
  getEmploymentDetails(userId: string): Promise<{ payBandId: string | null; dateOfJoining: Date | null } | null>;
  getPayBandRates(userId: string): Promise<{ baseSalaryPaise: Paise }>;
}

export interface HrPort {
  /** Approved unpaid-leave days in the month, halves allowed. */
  getUnpaidLeaveDays(userId: string, month: string): Promise<number>;
}

export interface FieldActivityPort {
  /** What was marked paid during the month: TA, DA and the manual reimbursements apart. */
  getPaidTaDaTotal(userId: string, month: string): Promise<{ taPaise: Paise; daPaise: Paise; reimbursementPaise: Paise }>;
}
