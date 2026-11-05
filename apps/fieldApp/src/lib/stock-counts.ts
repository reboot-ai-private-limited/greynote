import type { Accent } from '@/constants/theme';

import { apiGet, apiPatch, apiPost } from './api';
import { listMine } from './approvals';
import type { SecondaryAttachment } from './sales';

/**
 * Secondary sales per MR, distributor and product (docs/mobile/secondary-and-targets.md, 2026-11-05). Everything is in whole units;
 * amounts are only shown, as `units × PTS`. An MR saves a draft, attaches at least one proof file and submits the month to their
 * manager; only approved rows count. The approval request's kind is `STOCK_COUNT` and its record id is `userId:YYYY-MM`.
 */
export type StockCountStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type MonthStatus = StockCountStatus | 'NOT_ENTERED';

export type SecondaryStockLine = {
  product: { id: string; name: string; sku: string };
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
  /** `opening + primary − issued`; shown, never typed. */
  closingQty: number;
  /** What opening defaults to (the previous approved month's closing) and what primary defaults to (the MR's own Done orders). */
  suggestedOpeningQty: number;
  suggestedPrimaryQty: number;
  openingEdited: boolean;
  primaryEdited: boolean;
  /** `false` while the row only holds the defaults. */
  saved: boolean;
  /** `null` when the product has no PTS: units only. */
  ptsPaise: number | null;
  issuedAmountPaise: number | null;
  closingAmountPaise: number | null;
  /** Set when the manager above (or Admin) corrected the figures while the month waited; the MR saving again clears it. */
  managerEdit?: { by: { id: string; name: string }; at: string; reason: string; original: { openingQty: number; primaryQty: number; issuedQty: number } } | null;
};

export type SecondaryTotals = {
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
  closingQty: number;
  issuedAmountPaise: number;
  closingAmountPaise: number;
};

export type StockCountDistributor = {
  distributorId: string;
  name: string;
  status: MonthStatus;
  lines: SecondaryStockLine[];
  totals: SecondaryTotals;
};

export type StockCountsMonth = {
  userId: string;
  month: string;
  status: MonthStatus;
  /** The proof files; at least one is needed before the month can be submitted. */
  attachments: SecondaryAttachment[];
  attachmentCount: number;
  distributors: StockCountDistributor[];
  totals: SecondaryTotals;
};

export const STOCK_COUNT_KIND = 'STOCK_COUNT';

export const STOCK_COUNT_STATUS_TEXT: Record<MonthStatus, string> = {
  NOT_ENTERED: 'Not entered',
  DRAFT: 'Draft',
  PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Sent back',
};

export const STOCK_COUNT_STATUS_ACCENT: Record<MonthStatus, Accent> = { NOT_ENTERED: 'slate', DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

/** "Adjusted by Name: reason", with what the MR had entered, for a row the manager corrected; `null` for a row nobody changed. */
export const adjustedNote = (l: SecondaryStockLine) =>
  l.managerEdit
    ? `Adjusted by ${l.managerEdit.by.name}: ${l.managerEdit.reason}. MR entered opening ${l.managerEdit.original.openingQty} · primary ${l.managerEdit.original.primaryQty} · secondary ${l.managerEdit.original.issuedQty}.`
    : null;

/** A month with the manager or approved cannot be changed (`SECONDARY_LOCKED`). */
export const isHeld = (status: string) => status === 'PENDING' || status === 'APPROVED';

/** What the phone shows for closing: opening + primary − issued. */
export const closingOf = (opening: number, primary: number, issued: number) => opening + primary - issued;

/** The MR's month by distributor and product; the manager above, or Admin, may read it for a person in their team. */
export const getStockCounts = (userId: string, month: string) =>
  apiGet<StockCountsMonth>(`/sales/secondary-stock?userId=${userId}&month=${month}`, { fy: true });

export type SecondaryStockInput = { distributorId: string; productId: string; openingQty: number; primaryQty: number; issuedQty: number };

/** Saves rows as a draft (MR only). Saving again overwrites. `INVALID_PAYLOAD` when issued is more than opening + primary. */
export const saveStockCounts = (month: string, lines: SecondaryStockInput[]) =>
  apiPost<{ saved: number }>('/sales/secondary-stock', { month, lines }, { auth: true });

/**
 * The manager above an MR (or Admin) corrects rows the MR already sent, while the month waits for approval. A reason is required
 * (3 to 300 characters). Only rows the MR sent can be changed. Errors: `NOT_YOUR_TEAM`, `SECONDARY_NOT_PENDING`, `INVALID_PAYLOAD`.
 */
export const correctStockCounts = (userId: string, month: string, reason: string, lines: SecondaryStockInput[]) =>
  apiPatch<{ changed: number }>('/sales/secondary-stock', { userId, month, reason: reason.trim(), lines }, { auth: true });

/** Sends every draft or sent-back row to the manager. `ATTACHMENT_REQUIRED` without a file, `SECONDARY_NOTHING_TO_SEND` with nothing. */
export const submitStockCounts = (month: string) =>
  apiPost<{ requestId: string; sent: number }>('/sales/secondary-stock/submit', { month }, { auth: true });

/** The approval request of my own month, for withdrawing it or reading why it was sent back. */
export const findMyStockCountRequest = async (userId: string, month: string) =>
  (await listMine(100)).items.find((r) => r.kind === STOCK_COUNT_KIND && r.recordId === `${userId}:${month}`) ?? null;

/* ───────────────────────────── the manager's report ───────────────────────────── */

export type SecondaryReportLine = {
  product: { id: string; name: string; sku: string };
  openingQty: number;
  primaryQty: number;
  issuedQty: number;
  closingQty: number;
  ptsPaise: number | null;
  issuedAmountPaise: number | null;
  closingAmountPaise: number | null;
  byMr: { userId: string; name: string; openingQty: number; primaryQty: number; issuedQty: number; closingQty: number }[];
};

export type SecondaryReport = {
  month: string;
  mrCount: number;
  approvedMrCount: number;
  distributors: { distributorId: string; name: string; lines: SecondaryReportLine[]; totals: SecondaryTotals }[];
  totals: SecondaryTotals;
};

/** The approved rows of the MRs below the manager, summed by distributor then product. Admin may pass `managerId`. */
export const getSecondaryReport = (month: string, managerId?: string) =>
  apiGet<SecondaryReport>(`/sales/secondary-report?month=${month}${managerId ? `&managerId=${managerId}` : ''}`, { fy: true });
