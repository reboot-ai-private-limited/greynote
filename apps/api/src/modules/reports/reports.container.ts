import type { Router } from 'express';
import { readBusinessDay, type ConfigReader } from '@/shared/config/readConfig.js';
import { businessDate } from '@/shared/time/businessTime.js';
import { DoctorVisitsReport } from './application/doctorVisitsReport.js';
import { CallPerformanceReport } from './application/callPerformanceReport.js';
import { EmployeeSalesReport } from './application/employeeSalesReport.js';
import { TourPlanReport } from './application/tourPlanReport.js';
import { EmployeeMonthlyWorkReport } from './application/employeeMonthlyWorkReport.js';
import { SecondarySheetReport } from './application/secondarySheetReport.js';
import { DcrReport } from './application/dcrReport.js';
import { OrdersReport } from './application/ordersReport.js';
import { SalesDashboardReport } from './application/salesDashboardReport.js';
import { SalaryReport } from './application/salaryReport.js';
import { SalesBreakdownReport } from './application/salesBreakdownReport.js';
import { SalesReport } from './application/salesReport.js';
import { StockReport } from './application/stockReport.js';
import { TeamOverviewReport } from './application/teamOverviewReport.js';
import { TaDaReport } from './application/taDaReport.js';
import { MrStockFigures } from './application/mrStockFigures.js';
import type { WorkingCalendarPort, CallFiguresPort, PlaceNamesPort, LeaveDaysPort, DailyWorkActivityPort, DailyWorkPlanningPort, DoctorNamesPort, ExpenseStatementPort, SecondaryLinesPort, SecondaryRollupsPort, AttendancePort, DesignationLevelsPort, EmployeeSalesPort, StatementsPort, DoctorCallsPort, FieldActivityPort, FieldDaysPort, FieldRosterPort, IdentityPort, ManagerNamePort, MarketingPort, MasterPort, PayrollPort, PlanningPort, PlannedDoctorsPort, TourPlanExportPort, SalesPort, TerritoryPort, ZoneNamePort } from './domain/ports.js';
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
  identity: IdentityPort & FieldRosterPort & DesignationLevelsPort & ManagerNamePort & { getEmploymentDetails(userId: string): Promise<{ dateOfJoining: Date | null } | null> },
  master: MasterPort & DoctorNamesPort,
  sales: SalesPort & StatementsPort & EmployeeSalesPort & SecondaryLinesPort & SecondaryRollupsPort,
  fieldActivity: FieldActivityPort & FieldDaysPort & DoctorCallsPort & DailyWorkActivityPort & ExpenseStatementPort & CallFiguresPort,
  territory: TerritoryPort & ZoneNamePort & PlaceNamesPort,
  payroll: PayrollPort,
  planning: PlanningPort & PlannedDoctorsPort & DailyWorkPlanningPort & TourPlanExportPort,
  attendance: AttendancePort,
  marketing: MarketingPort,
  config: ConfigReader,
  hr: LeaveDaysPort & { listOffDates(userId: string, from: string, to: string): Promise<string[]> },
  now: () => Date = () => new Date(),
): ReportsContainer {
  // Working days for the call average (2026-11-28): HR's weekly offs, holidays and leave, Identity's joining date, Config's business day.
  const calendar: WorkingCalendarPort = {
    today: async () => {
      const { timeZone, dayStart } = await readBusinessDay(config);
      return businessDate(now(), timeZone, dayStart);
    },
    offDates: (userId, from, to) => hr.listOffDates(userId, from, to),
    leaveDays: (userId, from, to) => hr.listLeaveDays(userId, from, to),
    joinedOn: async (userId) => {
      const joined = (await identity.getEmploymentDetails(userId))?.dateOfJoining;
      // A date of record: read in the business timezone, not shifted by the day start.
      return joined ? businessDate(joined, (await readBusinessDay(config)).timeZone, '00:00') : null;
    },
  };
  const achievement = new MrStockFigures(sales);
  const orders = new OrdersReport(sales, master, identity);
  const salesReport = new SalesReport(sales, master, config);
  const stockReport = new StockReport(sales, master);
  const taDaReport = new TaDaReport(fieldActivity, territory, identity, config);
  const dcrReport = new DcrReport(fieldActivity, master, identity, config);
  const salaryReport = new SalaryReport(payroll, fieldActivity, identity, config);
  const salesDashboard = new SalesDashboardReport(identity, planning, attendance, fieldActivity, marketing, master, territory, config, achievement);
  const employeeSales = new EmployeeSalesReport(sales, marketing, master, identity, identity, achievement);
  const secondarySheet = new SecondarySheetReport(marketing, master, identity, config, achievement);
  const callPerformance = new CallPerformanceReport(identity, identity, fieldActivity, planning, master, calendar, territory);
  const monthlyWork = new EmployeeMonthlyWorkReport(planning, fieldActivity, attendance, sales, territory, identity, master, fieldActivity, hr, config, () => new Date(), callPerformance);
  const tourPlan = new TourPlanReport(planning, territory, identity);
  const salesBreakdown = new SalesBreakdownReport(salesDashboard, marketing, master, achievement, identity, config);
  const doctorVisits = new DoctorVisitsReport(identity, master, fieldActivity, planning);
  const teamOverview = new TeamOverviewReport(salesDashboard, fieldActivity, attendance);
  return {
    contract: { readTeamOverview: (input) => teamOverview.read(input) },
    buildRouter: () => buildReportsRouter(makeReportsControllers(orders, salesReport, stockReport, taDaReport, dcrReport, salaryReport, salesDashboard, employeeSales, doctorVisits, teamOverview, salesBreakdown, secondarySheet, monthlyWork, tourPlan, callPerformance)),
  };
}
