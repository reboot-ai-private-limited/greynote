import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { DcrReport } from './application/dcrReport.js';
import { OrdersReport } from './application/ordersReport.js';
import { SalesDashboardReport } from './application/salesDashboardReport.js';
import { SalaryReport } from './application/salaryReport.js';
import { SalesReport } from './application/salesReport.js';
import { StockReport } from './application/stockReport.js';
import { TaDaReport } from './application/taDaReport.js';
import type { AttendancePort, FieldActivityPort, FieldDaysPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort, PayrollPort, PlanningPort, SalesPort, TerritoryPort, ZoneNamePort } from './domain/ports.js';
import { makeReportsControllers } from './interface/reports.controller.js';
import { buildReportsRouter } from './interface/reports.route.js';

export interface ReportsContainer {
  buildRouter: () => Router;
}

/**
 * Tier 7, the top of the graph. Read-only reports for the Admin (sign-off K24, K27, K28; the Sales Dashboard is also open to managers over their downline): orders now; the sales, stock, TA/DA, DCR and salary
 * reports as they are built. It owns no data and writes nothing. Identity's, Field Master Data's, Sales' and Config's public contracts,
 * passed in by the composition root.
 */
export function buildReportsContainer(
  identity: IdentityPort & FieldRosterPort,
  master: MasterPort,
  sales: SalesPort,
  fieldActivity: FieldActivityPort & FieldDaysPort,
  territory: TerritoryPort & ZoneNamePort,
  payroll: PayrollPort,
  planning: PlanningPort,
  attendance: AttendancePort,
  marketing: MarketingPort,
  config: ConfigReader,
): ReportsContainer {
  const orders = new OrdersReport(sales, master, identity);
  const salesReport = new SalesReport(sales, master, config);
  const stockReport = new StockReport(sales, master);
  const taDaReport = new TaDaReport(fieldActivity, territory, identity, config);
  const dcrReport = new DcrReport(fieldActivity, master, identity, config);
  const salaryReport = new SalaryReport(payroll, fieldActivity, identity, config);
  const salesDashboard = new SalesDashboardReport(identity, planning, attendance, fieldActivity, marketing, territory, config);
  return { buildRouter: () => buildReportsRouter(makeReportsControllers(orders, salesReport, stockReport, taDaReport, dcrReport, salaryReport, salesDashboard)) };
}
