/** Reports' narrow views of the modules below it; their public contracts satisfy these structurally. */
export interface OrderRecord {
  id: string;
  userId: string;
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string };
  orderDate: string;
  status: 'PLACED' | 'DONE' | 'CANCELLED';
  totalAmountPaise: number;
  remarks: string | null;
  items: Array<{ productId: string; quantity: number; unitPricePaise: number; amountPaise: number }>;
  completedBy: string | null;
  completedAt: Date | null;
}

export interface StockRow {
  outlet: { type: 'CHEMIST' | 'DISTRIBUTOR'; id: string };
  productId: string;
  month: string;
  openingQty: number;
  closingQty: number;
}

export interface OrderSumRow {
  month: string;
  distributorId: string;
  productId: string;
  status: 'DONE' | 'PLACED';
  quantity: number;
  amountPaise: number;
}

export interface SalesPort {
  sumDistributorOrders(filter: { from: string; to: string; distributorId?: string; productId?: string }): Promise<OrderSumRow[]>;
  listStockRange(filter: { fromMonth: string; toMonth: string; outletType: 'CHEMIST' | 'DISTRIBUTOR'; outletId?: string; productId?: string }): Promise<StockRow[]>;
  listOrders(filter: { from?: string; to?: string; status?: 'PLACED' | 'DONE' | 'CANCELLED'; userId?: string; limit?: number }): Promise<OrderRecord[]>;
  getOrder(orderId: string): Promise<OrderRecord | null>;
}

export interface MasterPort {
  /** The doctors an employee covers now: those the employee is assigned and can see. */
  listAssignedDoctors(userId: string): Promise<Array<{ id: string; name: string; specialty: string }>>;
  listActiveOutlets(): Promise<{ distributors: Array<{ id: string; name: string }>; chemists: Array<{ id: string; name: string }> }>;
  listNames(query: { distributorIds?: string[]; chemistIds?: string[]; productIds?: string[] }): Promise<{
    distributors: Array<{ id: string; name: string }>;
    chemists: Array<{ id: string; name: string }>;
    products: Array<{ id: string; name: string; sku: string; ptrPaise: number | null }>;
  }>;
}

export interface IdentityPort {
  getUserSummaries(userIds: string[]): Promise<Array<{ id: string; name: string; employeeCode: string }>>;
}

export interface ExpenseMonthRow {
  userId: string;
  month: string;
  taPaise: number;
  daPaise: number;
  reimbursementPaise: number;
  paidPaise: number;
  unpaidPaise: number;
  flaggedRows: number;
}

export interface ExpenseRecord {
  id: string;
  userId: string;
  reportDate: string;
  routeId: string | null;
  type: 'TA' | 'DA' | 'TRAVEL' | 'MEAL' | 'MISC';
  source: 'AUTO' | 'MANUAL';
  amountPaise: number;
  remarks: string | null;
  paymentStatus: 'UNPAID' | 'PAID' | 'CANCELLED';
  distanceFlag: boolean;
  paidAt: Date | null;
}

export interface FieldActivityPort {
  summarizeDcrs(range: { from: string; to: string }): Promise<DcrMonthRow[]>;
  listCalledDoctorIds(userId: string, range: { from: string; to: string }): Promise<string[]>;
  summarizeExpenses(range: { from: string; to: string }): Promise<ExpenseMonthRow[]>;
  listAcceptedExpenses(filter: { from: string; to: string; userId?: string; limit?: number }): Promise<ExpenseRecord[]>;
}

export interface TerritoryPort {
  getRoute(routeId: string): Promise<{ id: string; name: string } | null>;
}

export interface DcrMonthRow {
  userId: string;
  month: string;
  reportedDays: number;
  lateDays: number;
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  geofence: { pass: number; fail: number; unverified: number; override: number };
}
