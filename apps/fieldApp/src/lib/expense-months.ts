import { apiDelete, apiGet, apiPost, apiPut, apiUpload, type UploadFile } from './api';

/**
 * The monthly expense statement (decision-log 2026-10-10): per date, the TA and DA the server worked out plus your own entries in the
 * single "Other" category. Everything needs a connection. Shapes follow packages/contracts fieldActivity.ts.
 */
export type ExpenseMonthStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export type ExpenseTotals = { taPaise: number; daPaise: number; otherPaise: number; totalPaise: number };

/** A receipt on an Other expense: up to 3 files of PDF, JPG or PNG, 5 MB each, optional. */
export type ExpenseProofFile = { id: string; url: string; fileName: string; mimeType: string; sizeBytes: number; uploadedAt: string };

export type ExpenseOther = { id: string; amountPaise: number; remarks: string | null; attachments?: ExpenseProofFile[] };

export type ExpenseDayLine = {
  date: string;
  taPaise: number;
  daPaise: number;
  otherPaise: number;
  totalPaise: number;
  others: ExpenseOther[];
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
  /** End of the day the month must be sent / approved by (ISO). Never worked out on the phone. */
  deadlines: { submitBy: string; approveBy: string };
  /** The open exception for each deadline: when it ends (ISO), or null. */
  exceptions: { submitUntil: string | null; approveUntil: string | null };
  /** The send deadline has passed with no exception. */
  submitLate: boolean;
};

export const SUBMIT_LATE_TEXT = 'The deadline has passed — ask your manager or Admin to allow it.';

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

/** Creates the expense; its receipts are uploaded afterwards, one request each, with `addExpenseProof`. */
export const addOther = (body: OtherExpenseBody) => apiPost<{ id: string }>('/field-activity/expenses/other', body, { auth: true });

/** Only the owner, only while the month is still editable and the expense unpaid. Returns the expense's files as they now stand. */
export const addExpenseProof = (expenseId: string, file: UploadFile) =>
  apiUpload<ExpenseProofFile[]>(`/field-activity/expenses/other/${expenseId}/attachments`, file);

export const removeExpenseProof = (expenseId: string, attachmentId: string) =>
  apiDelete<ExpenseProofFile[]>(`/field-activity/expenses/other/${expenseId}/attachments/${attachmentId}`);

export const editOther = (id: string, body: OtherExpenseBody) => apiPut<unknown>(`/field-activity/expenses/other/${id}`, body);

export const removeOther = (id: string) => apiDelete<unknown>(`/field-activity/expenses/other/${id}`);

export const submitMonth = (month: string) => apiPost<ExpenseStatement>(`/field-activity/expense-months/${month}/submit`, {}, { auth: true });
