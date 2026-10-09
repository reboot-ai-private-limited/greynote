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

/** The Sales Dashboard's views of Identity and Field Activity, kept apart so the other reports' fakes stay small. */
export interface FieldRosterPort {
  /** Active FIELD employees (never office staff), or only those among `onlyIds`, by name. */
  listFieldEmployees(onlyIds?: string[]): Promise<Array<{ id: string; employeeCode: string; name: string; designation: string | null; hqId: string | null; zoneId: string | null }>>;
  /** Everyone below a manager, at any depth. */
  getDownline(managerId: string): Promise<Array<{ id: string }>>;
}

export interface FieldDaysPort {
  summarizeTaDaByUser(range: { from: string; to: string }): Promise<Array<{ userId: string; taPaise: number; daPaise: number }>>;
  /** This user's reports in the range, each with its status (`DRAFT` until submitted). */
  getDcrSummary(userId: string, range: { from: string; to: string }): Promise<Array<{ reportDate: string; status: string }>>;
}

export interface PlanningPort {
  listDailyPlanDays(userId: string, from: string, to: string): Promise<Array<{ date: string; status: string; routeIds: string[] }>>;
}

export interface AttendancePort {
  getMonth(userId: string, month: string): Promise<{ days: Array<{ date: string; status: string }> }>;
}

export interface MarketingPort {
  listMonthFigures(userIds: string[], month: string): Promise<Array<{ userId: string; targetPaise: number | null; achievedPaise: number | null }>>;
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

export interface ZoneNamePort {
  getZone(zoneId: string): Promise<{ id: string; name: string } | null>;
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

export interface PayrollReportRow {
  runId: string;
  userId: string;
  month: string;
  status: 'DRAFT' | 'FINALIZED';
  baseSalaryPaise: number;
  leaveDeductionPaise: number;
  absentDeductionPaise: number;
  netPayablePaise: number;
  employerContributionPaise: number;
}

export interface PayrollPort {
  listRunsForReport(range: { fromMonth: string; toMonth: string }): Promise<PayrollReportRow[]>;
}
