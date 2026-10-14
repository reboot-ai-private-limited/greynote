import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { DoctorVisitsReport } from './application/doctorVisitsReport.js';
import { EmployeeSalesReport } from './application/employeeSalesReport.js';
import { DcrReport } from './application/dcrReport.js';
import { OrdersReport } from './application/ordersReport.js';
import { SalesDashboardReport } from './application/salesDashboardReport.js';
import { SalaryReport } from './application/salaryReport.js';
import { SalesReport } from './application/salesReport.js';
import { StockReport } from './application/stockReport.js';
import { TeamOverviewReport } from './application/teamOverviewReport.js';
import { TaDaReport } from './application/taDaReport.js';
import { DistributorAchievement } from './application/distributorAchievement.js';
import type { AttendancePort, EmployeeSalesPort, StatementsPort, DoctorCallsPort, FieldActivityPort, FieldDaysPort, FieldRosterPort, IdentityPort, MarketingPort, MasterPort, PayrollPort, PlanningPort, PlannedDoctorsPort, SalesPort, TerritoryPort, ZoneNamePort } from './domain/ports.js';
import type { ReportsPublicContract } from './reports.public.js';
import { makeReportsControllers } from './interface/reports.controller.js';
import { buildReportsRouter } from './interface/reports.route.js';

export interface ReportsContainer {
  contract: ReportsPublicContract;
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
  sales: SalesPort & StatementsPort & EmployeeSalesPort,
  fieldActivity: FieldActivityPort & FieldDaysPort & DoctorCallsPort,
  territory: TerritoryPort & ZoneNamePort,
  payroll: PayrollPort,
  planning: PlanningPort & PlannedDoctorsPort,
  attendance: AttendancePort,
  marketing: MarketingPort,
  config: ConfigReader,
): ReportsContainer {
  const achievement = new DistributorAchievement(sales, master);
  const orders = new OrdersReport(sales, master, identity);
  const salesReport = new SalesReport(sales, master, config);
  const stockReport = new StockReport(sales, master);
  const taDaReport = new TaDaReport(fieldActivity, territory, identity, config);
  const dcrReport = new DcrReport(fieldActivity, master, identity, config);
  const salaryReport = new SalaryReport(payroll, fieldActivity, identity, config);
  const salesDashboard = new SalesDashboardReport(identity, planning, attendance, fieldActivity, marketing, sales, master, territory, config, achievement);
  const employeeSales = new EmployeeSalesReport(sales, marketing, master, identity, identity, achievement);
  const doctorVisits = new DoctorVisitsReport(identity, master, fieldActivity, planning);
  const teamOverview = new TeamOverviewReport(salesDashboard, fieldActivity, attendance);
  return {
    contract: { readTeamOverview: (input) => teamOverview.read(input) },
    buildRouter: () => buildReportsRouter(makeReportsControllers(orders, salesReport, stockReport, taDaReport, dcrReport, salaryReport, salesDashboard, employeeSales, doctorVisits, teamOverview)),
  };
}
