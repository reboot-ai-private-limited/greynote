import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { asyncHandler } from '@/shared/http/asyncHandler.js';
import { requiredParam } from '@/shared/http/params.util.js';
import { sendSuccess } from '@/shared/http/response.util.js';
import type { OrdersReport } from '../application/ordersReport.js';
import type { ordersQuerySchema } from './reports.schemas.js';

export function makeReportsControllers(orders: OrdersReport): Record<'orders' | 'order', RequestHandler> {
  return {
    orders: asyncHandler(async (req, res) => {
      const q = req.query as unknown as z.output<typeof ordersQuerySchema>;
      sendSuccess(req, res, await orders.month({ month: q.month, type: q.type, status: q.status, mrId: q.mrId }), 'Orders for the month.', 200);
    }),
    order: asyncHandler(async (req, res) => {
      sendSuccess(req, res, await orders.detail(requiredParam(req.params, 'id')), 'The order.', 200);
    }),
  };
}
