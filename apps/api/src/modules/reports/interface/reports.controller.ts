import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { OrdersReport } from '../application/ordersReport.js';
import type { SalesReport } from '../application/salesReport.js';
import type { StockReport } from '../application/stockReport.js';
import type { TaDaReport } from '../application/taDaReport.js';
import type { ordersQuerySchema, salesStatementQuerySchema, salesYearQuerySchema, stockQuerySchema, taDaDaysQuerySchema, taDaYearQuerySchema } from './reports.schemas.js';

export function makeReportsControllers(orders: OrdersReport, sales: SalesReport, stock: StockReport, taDa: TaDaReport): Record<'orders' | 'order' | 'salesYear' | 'salesStatement' | 'stock' | 'taDaYear' | 'taDaDays', RequestHandler> {
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
    order: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await orders.detail(requiredParam(req.params, 'id')), 'The order.', 200);
    }),
  };
}
