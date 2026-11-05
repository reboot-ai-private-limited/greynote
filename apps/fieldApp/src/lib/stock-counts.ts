import type { Accent } from '@/constants/theme';

import { apiGet, apiPost } from './api';
import { listMine } from './approvals';

/**
 * Distributor stock counts with approval (docs/mobile/secondary-and-targets.md, 2026-11-04). While the Admin setting
 * `STOCK_COUNT_APPROVAL` is on, an employee's count is a draft until they submit the month to their manager, and only approved
 * counts feed achievement. The request's kind is `STOCK_COUNT` and its record id is `userId:YYYY-MM`.
 */
export type StockCountStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type StockCountLine = {
  product: { id: string; name: string; sku: string };
  openingQty: number;
  closingQty: number;
  deliveredQty: number;
  secondaryQty: number | null;
  /** At the product's PTS; `null` when it has none. */
  secondaryAmountPaise: number | null;
};

export type StockCountDistributor = { distributorId: string; name: string; status: StockCountStatus; lines: StockCountLine[] };

export type StockCountsMonth = {
  userId: string;
  month: string;
  status: StockCountStatus | 'NOT_ENTERED';
  distributors: StockCountDistributor[];
};

export const STOCK_COUNT_KIND = 'STOCK_COUNT';

export const STOCK_COUNT_STATUS_TEXT: Record<StockCountStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Waiting for approval',
  APPROVED: 'Approved',
  REJECTED: 'Sent back',
};

export const STOCK_COUNT_STATUS_ACCENT: Record<StockCountStatus, Accent> = { DRAFT: 'slate', PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' };

/** Only approval produces these: with the setting off a count has no status, and the server reads that as approved. */
export const isUnfinishedCount = (status: string) => status === 'DRAFT' || status === 'PENDING' || status === 'REJECTED';

/** The month by distributor: the employee, the manager above, or Admin. */
export const getStockCounts = (userId: string, month: string) =>
  apiGet<StockCountsMonth>(`/sales/stock-counts?userId=${userId}&month=${month}`, { fy: true });

/** Sends every draft or sent-back distributor count of the month to the manager. Online only; `SECONDARY_NOTHING_TO_SEND` when there is none. */
export const submitStockCounts = (month: string) =>
  apiPost<{ requestId: string; sent: number }>('/sales/stock-counts/submit', { month }, { auth: true });

/** The approval request of my own month, for withdrawing it or reading why it was sent back. */
export const findMyStockCountRequest = async (userId: string, month: string) =>
  (await listMine(100)).items.find((r) => r.kind === STOCK_COUNT_KIND && r.recordId === `${userId}:${month}`) ?? null;
