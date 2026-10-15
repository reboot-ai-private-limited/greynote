import type { DiscountDto } from './sales.js';

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
  /** What the order comes to at the order's prices, after any discounts. */
  totalAmountPaise: number;
  /** A Done order: what was delivered, free units excluded (the total when no supply was recorded); `null` while Placed or once Cancelled. This is what primary counts. */
  suppliedAmountPaise: number | null;
  /** When it was marked Done or Cancelled. */
  completedAt: string | null;
  remarks: string | null;
}

export interface ReportOrderItemDto {
  productId: string;
  productName: string;
  sku: string;
  /** Ordered. */
  quantity: number;
  unitPricePaise: number;
  /** Ordered × price, before the discount. */
  amountPaise: number;
  /** Discount given on this line; `null` if none. */
  discount: DiscountDto | null;
  /** The line after its own discount and its share of the order discount. */
  netAmountPaise: number;
  /** A Done order: units supplied of `quantity` (all of it when no supply was recorded); `null` otherwise. */
  suppliedQty: number | null;
  /** Units to be given (a Done order: given) free on top; not charged, in no amount. `0` if none. */
  freeQty: number;
}

export interface ReportOrderDetailDto extends ReportOrderRowDto {
  items: ReportOrderItemDto[];
  /** What the employee originally ordered, kept when the office first changed the order; `null` if it was never changed. Lines match `items` by product (a line the office removed or added is only on one side). */
  original: Array<{ productId: string; productName: string; quantity: number; unitPricePaise: number }> | null;
  originalTotalAmountPaise: number | null;
  /** Discount on the whole order; `null` if none. */
  discount: DiscountDto | null;
  /** What the order discount came to in rupees (already inside the lines' nets). */
  orderDiscountPaise: number;
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

// ── Sales (primary and secondary, sign-off K9, K21, K22, K29, K31) ───────────────────────────────

/** One month of the Sales chart. Primary: Done orders to distributors (the month marked Done). Secondary: what the distributors sold on, from their stock counts. */
export interface SalesMonthDto {
  /** `YYYY-MM`. */
  month: string;
  /** `FUTURE` has no figures; `OPEN` is the month in progress (its stock is counted after it ends). */
  state: 'ENDED' | 'OPEN' | 'FUTURE';
  primaryQty: number;
  /** The amounts on the Done orders, whole paise. */
  primaryPaise: number;
  /** Orders placed in the month and not yet Done. */
  placedQty: number;
  placedPaise: number;
  /** `opening + primary − closing` over the distributors' counts; `null` when nothing was counted (or a future month). */
  secondaryQty: number | null;
  /** The secondary quantity valued at each product's PTR; `null` when there is no secondary. */
  secondaryPaise: number | null;
  /** Active distributors with at least one count that month, out of those expected. */
  countedDistributors: number;
  expectedDistributors: number;
  /** Every active distributor counted: when false the secondary bar is only part of the picture. */
  complete: boolean;
  /** Counts whose secondary came out below zero (a counting or entry error): left out of the totals. */
  negativeRows: number;
  /** Counts of a product with no PTR on its card: in the quantity but not in the value. */
  unpricedRows: number;
}

/** `GET /reports/sales?year=`: the twelve months of a financial year. */
export interface SalesYearReportDto {
  /** The year it starts in (2026 is April 2026 to March 2027). */
  year: number;
  months: SalesMonthDto[];
  totals: { primaryQty: number; primaryPaise: number; secondaryQty: number; secondaryPaise: number };
}

export type SalesRowFlag = 'NO_COUNT' | 'NEGATIVE_SECONDARY' | 'NEGATIVE_CLOSING' | 'COUNT_MISMATCH' | 'OPENING_MISMATCH' | 'UNPRICED';

/** Where a row's figures come from: Admin's statement, the field workers' counts, or nothing counted yet (`NONE`). */
export type SalesRowSource = 'STATEMENT' | 'FIELD_COUNT' | 'NONE';

/** One distributor and product in one month: the stock statement. */
export interface SalesStatementRowDto {
  distributor: { id: string; name: string };
  product: { id: string; name: string; sku: string };
  /** `null` when there was no count for it. */
  openingQty: number | null;
  /** Done orders + the adjustment. */
  primaryQty: number;
  /** Done orders in the month, before the adjustment. */
  orderPrimaryQty: number;
  /** Admin's adjustment to primary: supply without an app order (+) or a return (−). */
  adjustmentQty: number;
  /** Done order amounts + the adjustment valued at PTS. */
  primaryPaise: number;
  placedQty: number;
  closingQty: number | null;
  secondaryQty: number | null;
  secondaryPaise: number | null;
  source: SalesRowSource;
  flags: SalesRowFlag[];
}

/** `GET /reports/sales/statement?month=`. */
export interface SalesStatementDto {
  month: string;
  rows: SalesStatementRowDto[];
  /** Active distributors with no count at all this month. */
  missingDistributors: Array<{ id: string; name: string }>;
  totals: { primaryQty: number; primaryPaise: number; placedPaise: number; secondaryQty: number; secondaryPaise: number };
}

// ── Stock ──────────────────────────────────────────────────────────────────────────────────────

export type StockRowFlag = 'NO_COUNT' | 'OPENING_MISMATCH' | 'NEGATIVE_SECONDARY';

export interface StockReportRowDto {
  outletType: 'DISTRIBUTOR' | 'CHEMIST';
  outlet: { id: string; name: string };
  /** `null` on the single row of an outlet with no count at all. */
  product: { id: string; name: string; sku: string } | null;
  openingQty: number | null;
  /** The previous month's closing count of the same outlet and product, when there is one. */
  previousClosingQty: number | null;
  closingQty: number | null;
  flags: StockRowFlag[];
}

/** `GET /reports/stock?month=`: the month's stock counts, with who has not counted and what does not add up. */
export interface StockReportDto {
  month: string;
  rows: StockReportRowDto[];
  completeness: { distributors: { counted: number; expected: number }; chemists: { counted: number; expected: number } };
  /** Rows carrying any flag. */
  flagged: number;
}

// ── TA/DA (sign-off K28) ─────────────────────────────────────────────────────────────────────────

/** Accepted expenses (past the manager and not sent back; cancelled ones left out), whole paise. */
export interface TaDaFiguresDto {
  taPaise: number;
  daPaise: number;
  /** Travel, meals and other claims entered by hand. */
  reimbursementPaise: number;
  /** TA + DA + reimbursements. */
  totalPaise: number;
  paidPaise: number;
  unpaidPaise: number;
  /** TA rows whose route distance could not be calculated, so the amount is artificially low. */
  flaggedRows: number;
}

export interface TaDaMonthDto extends TaDaFiguresDto {
  /** `YYYY-MM`, by the day reported. */
  month: string;
  state: 'ENDED' | 'OPEN' | 'FUTURE';
  /** Employees with an accepted expense that month. */
  employees: number;
}

export interface TaDaMrRowDto extends TaDaFiguresDto {
  month: string;
  mr: { id: string; name: string; employeeCode: string };
}

/** `GET /reports/ta-da?year=`: the financial year by month, and each employee's month. */
export interface TaDaYearReportDto {
  year: number;
  months: TaDaMonthDto[];
  rows: TaDaMrRowDto[];
  totals: TaDaFiguresDto;
}

export interface TaDaDayRowDto {
  /** `YYYY-MM-DD`, the day reported. */
  date: string;
  type: 'TA' | 'DA' | 'OTHER' | 'TRAVEL' | 'MEAL' | 'MISC';
  source: 'AUTO' | 'MANUAL';
  route: { id: string; name: string } | null;
  amountPaise: number;
  status: 'PAID' | 'UNPAID';
  paidAt: string | null;
  distanceFlag: boolean;
  remarks: string | null;
}

/** `GET /reports/ta-da/days?userId=&month=`: one employee's accepted expenses, day by day. */
export interface TaDaDaysDto {
  month: string;
  mr: { id: string; name: string; employeeCode: string };
  rows: TaDaDayRowDto[];
  /** The list is capped; true when it may be short. */
  truncated: boolean;
}

// ── DCR (daily reports; sign-off K28: calls only) ────────────────────────────────────────────────

/** What the reported days of a period came to. A day is reported once its daily report is submitted or approved. */
export interface DcrFiguresDto {
  reportedDays: number;
  /** Reported days submitted after the day itself. */
  lateDays: number;
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  /** Doctor and chemist calls together. */
  calls: number;
  /** Calls per reported day, one decimal; `null` with no reported day. */
  callsPerDay: number | null;
  /** The server's geofence result for every call. */
  geofence: { pass: number; fail: number; unverified: number; override: number };
  /** Calls the geofence could not confirm (failed or unverified) and nobody overrode. */
  unconfirmed: number;
  /** Doctor calls to a doctor who wasn't on the day's plan (allowed, and flagged). */
  notInPlan: number;
  /** Follow-ups on a doctor not on the day's plan, or a chemist whose route the plan doesn't list. */
  followupsNotInPlan: number;
  /** Doctor and chemist calls on a route the day's plan doesn't list. */
  offRouteCalls: number;
}

export interface DcrMonthDto extends DcrFiguresDto {
  month: string;
  state: 'ENDED' | 'OPEN' | 'FUTURE';
  /** Employees with a reported day that month. */
  employees: number;
}

export interface DcrMrRowDto extends DcrFiguresDto {
  month: string;
  mr: { id: string; name: string; employeeCode: string };
}

/** `GET /reports/dcr?year=`. */
export interface DcrYearReportDto {
  year: number;
  months: DcrMonthDto[];
  rows: DcrMrRowDto[];
  totals: DcrFiguresDto;
}

/** `GET /reports/dcr/coverage?userId=&month=`: the doctors assigned to an employee now, and which of them they called on that month. */
export interface DcrCoverageDto {
  month: string;
  mr: { id: string; name: string; employeeCode: string };
  assigned: number;
  visited: number;
  notVisited: Array<{ id: string; name: string; specialty: string }>;
}

// ── Doctor visits (monthly call frequency) ─────────────────────────────────────────────────────

/** One Doctor's month against its visit frequency. `made` counts calls on reported (submitted or approved) daily reports only. */
export interface DoctorVisitRowDto {
  doctor: { id: string; name: string; specialty: string };
  /** The Doctor's visit frequency (1–5): calls expected this month. */
  frequency: number;
  made: number;
  /** `max(0, frequency − made)`. */
  missed: number;
  /** Where this month stands: all visits made, some made, or none yet. */
  stage: 'COMPLETE' | 'IN_PROGRESS' | 'NOT_STARTED';
  /** Days this month the Doctor was on an approved daily plan, up to yesterday. */
  plannedDays: number;
  /** The day the Doctor was first planned and then never called on or after — the missed call carried forward; `null` if none. */
  missedSince: string | null;
}

export interface DoctorVisitMrDto {
  mr: { id: string; name: string; employeeCode: string };
  /** Sum of the frequencies of this employee's Doctors that have one. */
  quota: number;
  /** Calls counted against the quota (never more than a Doctor's own frequency). */
  made: number;
  missed: number;
  /** Doctors with a frequency / of those, how many reached it. */
  doctors: number;
  completedDoctors: number;
  rows: DoctorVisitRowDto[];
}

/** `GET /reports/doctor-visits?month=&userId=`. */
export interface DoctorVisitsReportDto {
  month: string;
  mrs: DoctorVisitMrDto[];
  totals: { quota: number; made: number; missed: number; doctors: number; completedDoctors: number };
}

// ── Salary (sign-off K30) ────────────────────────────────────────────────────────────────────────

/** What a month's finalized salary runs came to, whole paise. Draft runs are never in these figures. */
export interface SalaryFiguresDto {
  basePaise: number;
  leaveDeductionPaise: number;
  absentDeductionPaise: number;
  /** What the employees were paid. */
  netPaise: number;
  /** The employer's EPF/ESI and the like for the month. */
  employerPaise: number;
  /** What the salary costs the company: net pay plus the employer's contributions. */
  costToCompanyPaise: number;
}

export interface SalaryMonthDto extends SalaryFiguresDto {
  /** `YYYY-MM`. */
  month: string;
  /**
   * `FINAL`: every run is finalized; `DRAFT`: there are runs and none is finalized; `PARTIAL`: some of each; `NONE`: the month ended with no run;
   * `OPEN` and `FUTURE`: not over yet.
   */
  state: 'FINAL' | 'DRAFT' | 'PARTIAL' | 'NONE' | 'OPEN' | 'FUTURE';
  finalEmployees: number;
  draftEmployees: number;
  /** The net pay of the draft runs: shown hatched, not in the figures above. */
  draftNetPaise: number;
  /** Accepted TA, DA and manual reimbursements of the month, by the day reported (paid or not). */
  taPaise: number;
  daPaise: number;
  reimbursementPaise: number;
}

export interface SalaryRowDto {
  month: string;
  user: { id: string; name: string; employeeCode: string };
  status: 'DRAFT' | 'FINALIZED';
  /** For the payslip link. */
  runId: string;
  basePaise: number;
  leaveDeductionPaise: number;
  absentDeductionPaise: number;
  netPaise: number;
  employerPaise: number;
  costToCompanyPaise: number;
}

/** `GET /reports/salary?year=`. */
export interface SalaryYearReportDto {
  year: number;
  months: SalaryMonthDto[];
  /** Every run of the year, drafts included (each says which it is). */
  rows: SalaryRowDto[];
  /** Finalized runs only. */
  totals: SalaryFiguresDto;
}

/** How many of an employee's working days in the range have a day plan / a daily report, and how many of those are fully approved. */
export interface SalesDashboardComplianceDto {
  /** Working days with one that is submitted, manager-approved or approved (a draft, rejected or missing one is not). */
  submitted: number;
  /** Working days with one fully approved. */
  approved: number;
}

export interface SalesDashboardRowDto {
  employee: { id: string; name: string; employeeCode: string };
  designation: string | null;
  zone: string | null;
  /** Names of the Routes in the range's day plans, oldest first, each once. */
  routes: string[];
  /** Days in the range that were working days for this employee: not before joining, a holiday, a weekly off or leave. */
  workingDays: number;
  plan: SalesDashboardComplianceDto;
  dcr: SalesDashboardComplianceDto;
  /** Accepted TA and DA claimed in the range, cancelled ones left out. */
  taPaise: number;
  daPaise: number;
  /** The employee's targets over the months of the range (a longer target counts its even share of each month); `null` = none set. */
  targetPaise: number | null;
  /** What they entered as secondary in those months, at PTR — their achievement; `null` = nothing entered and no target. */
  achievedPaise: number | null;
  /** Their Done distributor orders plus Admin's change, in those months. */
  primaryPaise: number;
  /**
   * A manager (any designation above MR): how many MRs in their whole team the target, achievement and primary columns add up.
   * `null` for an MR, whose figures are their own.
   */
  mrCount?: number | null;
}

/** `GET /reports/sales-dashboard?from=&to=`: the field force over a range, one page of rows and the totals of all of them. */
export interface SalesDashboardDto {
  /** The range actually read: `to` is held to today, since a future day has nothing yet. */
  from: string;
  to: string;
  /** The months the target, primary and achievement columns cover (`YYYY-MM`, both inclusive): those of `from` and `to`. */
  fromMonth: string;
  toMonth: string;
  rows: SalesDashboardRowDto[];
  totals: { employees: number; taPaise: number; daPaise: number; targetPaise: number; achievedPaise: number; primaryPaise: number };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** One product of an employee's view over a run of months. */
export interface EmployeeProductFigureDto {
  product: { id: string; name: string; sku: string };
  /** The share of this product's targets inside the months asked about. */
  targetPaise: number;
  primaryQty: number;
  /** Done orders plus Admin's change valued at PTS (a product with no PTS adds units only). */
  primaryPaise: number;
  secondaryQty: number;
  /** At PTR; units of a product with no PTR are in `secondaryQty` only. */
  secondaryPaise: number;
  /** Achievement as a whole percent of `targetPaise`; `null` = no target. */
  achievementPercent: number | null;
  flags: Array<'NO_PTS' | 'NO_PTS_CHANGE'>;
}

/** One target, measured over its own months. */
export interface EmployeeTargetFigureDto {
  id: string;
  /** `null` = a target for all products. */
  product: { id: string; name: string } | null;
  fromMonth: string;
  toMonth: string;
  amountPaise: number;
  /** The employee's secondary in those months (that product's, or all), at PTR. */
  achievedPaise: number;
  achievementPercent: number | null;
  /** The target in units (a product target with a PTR); `null` otherwise. Units × PTR is the amount. */
  targetQty: number | null;
  /** Approved secondary units in those months. */
  achievedQty: number;
  achievementQtyPercent: number | null;
}

/** `GET /reports/employee-sales?userId=&from=&to=` (months): one employee's targets, primary and secondary by product. */
export interface EmployeeSalesReportDto {
  employee: { id: string; name: string; employeeCode: string };
  fromMonth: string;
  toMonth: string;
  /** Products with a target, an order or a secondary in the months, by name. */
  products: EmployeeProductFigureDto[];
  /** The share of targets for all products in the months. */
  generalTargetPaise: number;
  totals: { targetPaise: number; primaryPaise: number; secondaryPaise: number; achievementPercent: number | null };
  /** Every target touching the months, each measured over its own months. For a manager the targets of their MRs, one row per product and run of months. */
  targets: EmployeeTargetFigureDto[];
  /** A manager's figures are the sum of the MRs in their whole team: how many there are. `null` for an MR. */
  team?: { mrCount: number } | null;
  /**
   * The employee's primary by distributor: Done orders to each distributor in the months (the month marked Done), by name. The rows add up to
   * the order part of `totals.primaryPaise`. Secondary is entered per product, not per distributor, so it has no row here; a distributor's own
   * secondary is on the Sales report.
   */
  distributors: EmployeeDistributorFigureDto[];
}

export interface EmployeeDistributorFigureDto {
  distributor: { id: string; name: string };
  /** Units on the Done orders. */
  orderQty: number;
  /** What those orders add up to, as ordered. */
  orderPaise: number;
}
