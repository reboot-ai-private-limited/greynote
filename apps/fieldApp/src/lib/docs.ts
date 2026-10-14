import { apiGet } from './api';

/**
 * The Docs tab (docs/mobile/docs.md): the employee's own finalized payslips and the documents an Admin shared. Shapes follow
 * packages/contracts payslip.ts and documents.ts. Payslips follow the financial year in view; documents do not.
 */
export type SlipLine = { label: string; amountPaise: number };

export type Payslip = {
  earnings: SlipLine[];
  deductions: SlipLine[];
  grossPaise: number;
  deductionPaise: number;
  /** What brought the net to a whole rupee (signed), from 2026-10-14; shown beside the net, in neither table. Missing on an old slip. */
  roundingPaise?: number;
  netPaise: number;
};

export type MyPayslip = {
  id: string;
  /** `YYYY-MM`. */
  month: string;
  finalizedAt: string | null;
  slip: Payslip;
};

export type DocumentCategory = 'POLICY' | 'CIRCULAR' | 'FORM' | 'OTHER';

export type CompanyDocument = {
  id: string;
  title: string;
  category: DocumentCategory;
  fileKind: 'pdf' | 'jpeg' | 'png';
  url: string;
  sizeBytes: number;
  uploadedAt: string;
};

export const CATEGORY_LABEL: Record<DocumentCategory, string> = { POLICY: 'Policy', CIRCULAR: 'Circular', FORM: 'Form', OTHER: 'Other' };

/** The finalized slips for the year in view, newest first. A month with no slip is simply absent. */
export const listMyPayslips = async () => {
  const slips = await apiGet<MyPayslip[]>('/payroll/me', { auth: true, fy: true });
  return [...slips].sort((a, b) => b.month.localeCompare(a.month));
};

/** What an Admin shared with everyone or with this employee, newest first; not tied to a year, so no financial-year header. */
export const listMyDocuments = async () => {
  const docs = await apiGet<CompanyDocument[]>('/documents', { auth: true });
  return [...docs].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
};
