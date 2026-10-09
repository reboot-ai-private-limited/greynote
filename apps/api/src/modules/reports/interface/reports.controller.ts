import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { DcrReport } from '../application/dcrReport.js';
import type { OrdersReport } from '../application/ordersReport.js';
import type { SalesDashboardReport } from '../application/salesDashboardReport.js';
import type { SalesReport } from '../application/salesReport.js';
import type { SalaryReport } from '../application/salaryReport.js';
import type { StockReport } from '../application/stockReport.js';
import type { TaDaReport } from '../application/taDaReport.js';
import type { dcrCoverageQuerySchema, dcrYearQuerySchema, ordersQuerySchema, salaryYearQuerySchema, salesDashboardQuerySchema, salesStatementQuerySchema, salesYearQuerySchema, stockQuerySchema, taDaDaysQuerySchema, taDaYearQuerySchema } from './reports.schemas.js';

export function makeReportsControllers(orders: OrdersReport, sales: SalesReport, stock: StockReport, taDa: TaDaReport, dcr: DcrReport, salary: SalaryReport, salesDashboard: SalesDashboardReport): Record<'orders' | 'salesDashboard' | 'order' | 'salesYear' | 'salesStatement' | 'stock' | 'taDaYear' | 'taDaDays' | 'dcrYear' | 'dcrCoverage' | 'salaryYear', RequestHandler> {
  return {
    orders: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof ordersQuerySchema>;
      sendSuccess(req, res, await orders.month({ month: q.month, type: q.type, status: q.status, mrId: q.mrId }), 'Orders for the month.', 200);
    }),
    salesYear: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof salesYearQuerySchema>;
      sendSuccess(req, res, await sales.year({ year: q.year, distributorId: q.distributorId, productId: q.productId }), 'Sales for the financial year.', 200);
    }),
    salesStatement: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof salesStatementQuerySchema>;
      sendSuccess(req, res, await sales.statement({ month: q.month, distributorId: q.distributorId, productId: q.productId }), 'The stock and sales statement.', 200);
    }),
    stock: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof stockQuerySchema>;
      sendSuccess(req, res, await stock.month({ month: q.month }), 'Stock counts for the month.', 200);
    }),
    taDaYear: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof taDaYearQuerySchema>;
      sendSuccess(req, res, await taDa.year({ year: q.year }), 'TA and DA for the financial year.', 200);
    }),
    taDaDays: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof taDaDaysQuerySchema>;
      sendSuccess(req, res, await taDa.days({ userId: q.userId, month: q.month }), 'TA and DA, day by day.', 200);
    }),
    dcrYear: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof dcrYearQuerySchema>;
      sendSuccess(req, res, await dcr.year({ year: q.year }), 'Daily reports for the financial year.', 200);
    }),
    dcrCoverage: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof dcrCoverageQuerySchema>;
      sendSuccess(req, res, await dcr.coverage({ userId: q.userId, month: q.month }), 'Doctor coverage for the month.', 200);
    }),
    salaryYear: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof salaryYearQuerySchema>;
      sendSuccess(req, res, await salary.year({ year: q.year }), 'Salary for the financial year.', 200);
    }),
    salesDashboard: asyncHandler(async (req, res) => {
      if (!req.user) throw AppError.unauthenticated();
      const q = req.query as unknown as z.output<typeof salesDashboardQuerySchema>;
      sendSuccess(req, res, await salesDashboard.read({ actor: { id: req.user.sub, role: req.user.role }, from: q.from, to: q.to, search: q.search, page: q.page, pageSize: q.pageSize }), 'The sales dashboard.', 200);
    }),
    order: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await orders.detail(requiredParam(req.params, 'id')), 'The order.', 200);
    }),
  };
}
