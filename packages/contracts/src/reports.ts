/** One order in the Orders report: who placed it, for which outlet, how much, and where it stands. Money is whole paise. */
export interface ReportOrderRowDto {
  id: string;
  /** `YYYY-MM-DD`, the day it was placed. */
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  /** A Distributor's order is a primary sale once Done; a Chemist's is information only (sign-off K23). */
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outlet: { id: string; name: string };
  mr: { id: string; name: string; employeeCode: string };
  itemCount: number;
  totalAmountPaise: number;
  /** When it was marked Done or Cancelled. */
  completedAt: string | null;
  remarks: string | null;
}

export interface ReportOrderItemDto {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPricePaise: number;
  amountPaise: number;
}

export interface ReportOrderDetailDto extends ReportOrderRowDto {
  items: ReportOrderItemDto[];
  completedBy: { id: string; name: string } | null;
}

/** `GET /reports/orders`: one month of orders by their order date, with what each status adds up to. */
export interface OrdersReportDto {
  /** `YYYY-MM`. */
  month: string;
  rows: ReportOrderRowDto[];
  /** Over the rows returned (after the filters): Done is what counts as primary for a Distributor. */
  totals: {
    done: { count: number; amountPaise: number };
    placed: { count: number; amountPaise: number };
    cancelled: { count: number; amountPaise: number };
  };
  /** The list is capped; true when it may be missing older rows of the month. */
  truncated: boolean;
}
