import type { OrdersReportDto, ReportOrderRowDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { rupeesForCsv, toCsv } from '@/lib/csv';

export type OrderStatus = ReportOrderRowDto['status'];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { PLACED: 'Placed', DONE: 'Done', CANCELLED: 'Cancelled' };
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = { PLACED: 'warning', DONE: 'success', CANCELLED: 'neutral' };

export type OrderTab = 'DISTRIBUTOR' | 'CHEMIST';

export const ORDER_TABS: ReadonlyArray<{ value: OrderTab; label: string; note: string }> = [
  { value: 'DISTRIBUTOR', label: 'To distributors', note: 'A Done order to a distributor is a primary sale.' },
  { value: 'CHEMIST', label: 'Chemist orders', note: 'Information only: a chemist order is supplied through a distributor and is not part of primary or secondary.' },
];

/** The tab named in the URL, or the first. */
export const tabOf = (value: string): OrderTab => (value === 'CHEMIST' ? 'CHEMIST' : 'DISTRIBUTOR');

/** Only a placed order can be finished, and a chemist order is information, so it is never finished from here. */
export const canFinish = (row: Pick<ReportOrderRowDto, 'status' | 'outletType'>): boolean => row.status === 'PLACED' && row.outletType === 'DISTRIBUTOR';

/** A Done distributor order from before invoices has no number yet: the office can give it one, so it can be invoiced and paid against. */
export const needsInvoiceNumber = (row: Pick<ReportOrderRowDto, 'status' | 'outletType' | 'invoiceNumber'>): boolean => row.status === 'DONE' && row.outletType === 'DISTRIBUTOR' && !row.invoiceNumber;

/** What the status totals read as: "3 · ₹1,20,000.00". */
export const OPTIONS_STATUS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'all', label: 'Any status' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

export const ORDERS_CSV_HEADER = ['Order date', 'Outlet type', 'Outlet', 'MR code', 'MR', 'Items', 'Amount (INR)', 'Status', 'Done or cancelled on'] as const;

export function ordersCsv(report: Pick<OrdersReportDto, 'rows'>): string {
  return toCsv(
    ORDERS_CSV_HEADER,
    report.rows.map((r) => [r.orderDate, r.outletType === 'DISTRIBUTOR' ? 'Distributor' : 'Chemist', r.outlet.name, r.mr.employeeCode, r.mr.name, r.itemCount, rupeesForCsv(r.totalAmountPaise), ORDER_STATUS_LABEL[r.status], r.completedAt ? r.completedAt.slice(0, 10) : '']),
  );
}

export const ordersFilename = (month: string, tab: OrderTab): string => `orders-${tab === 'DISTRIBUTOR' ? 'distributors' : 'chemists'}-${month}.csv`;
