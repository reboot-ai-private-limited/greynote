export type ExpensePaymentStatus = 'UNPAID' | 'PAID';

/** One row of `GET /field-activity/expenses` (Accountant audit) — a bare array, capped at 500. */
export interface ExpenseAuditRowDto {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  reportDate: string;
  type: string;
  source: string;
  amountPaise: number;
  paymentStatus: ExpensePaymentStatus | 'CANCELLED';
  paidAt: string | null;
}
