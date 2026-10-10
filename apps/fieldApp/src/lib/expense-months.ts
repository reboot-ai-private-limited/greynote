import { apiDelete, apiGet, apiPost, apiPut } from './api';

/**
 * The monthly expense statement (decision-log 2026-10-10): per date, the TA and DA the server worked out plus your own entries in the
 * single "Other" category. Everything needs a connection. Shapes follow packages/contracts fieldActivity.ts.
 */
export type ExpenseMonthStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type ExpenseTotals = { taPaise: number; daPaise: number; otherPaise: number; totalPaise: number };

export type ExpenseDayLine = {
  date: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  others: { id: string; amountPaise: number; remarks: string | null }[];
};

export type ExpenseStatement = {
  userId: string;
  month: string;
  status: ExpenseMonthStatus;
  requestId: string | null;
  monthEnded: boolean;
  editable: boolean;
  canSubmit: boolean;
  days: ExpenseDayLine[];
  totals: ExpenseTotals;
  submittedTotals: ExpenseTotals | null;
  paidPaise: number;
};

export type ExpenseMonthSummary = ExpenseTotals & { month: string; status: ExpenseMonthStatus; paidPaise: number };

export type OtherExpenseBody = { reportDate: string; amountPaise: number; remarks: string | null };

export const STATUS_TEXT: Record<ExpenseMonthStatus, string> = {
  DRAFT: 'Not sent yet',
  SUBMITTED: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Sent back — change it and send it again',
};

/** The year switch (lib/financial-year.ts) bounds the statement; the history is across years. */
export const getStatement = (month: string) => apiGet<ExpenseStatement>(`/field-activity/expense-months?month=${month}`, { fy: true });

export const getStatementById = (recordId: string) => apiGet<ExpenseStatement>(`/field-activity/expense-months/${recordId}`);

export const getHistory = () => apiGet<ExpenseMonthSummary[]>('/field-activity/expense-months/history');

export const addOther = (body: OtherExpenseBody) => apiPost<unknown>('/field-activity/expenses/other', body, { auth: true });

export const editOther = (id: string, body: OtherExpenseBody) => apiPut<unknown>(`/field-activity/expenses/other/${id}`, body);

export const removeOther = (id: string) => apiDelete<unknown>(`/field-activity/expenses/other/${id}`);

export const submitMonth = (month: string) => apiPost<ExpenseStatement>(`/field-activity/expense-months/${month}/submit`, {}, { auth: true });
