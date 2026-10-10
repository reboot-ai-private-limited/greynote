import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { SalesHandlers } from './sales.controller.js';
import { cancelPaymentBodySchema, employeeSalesQuerySchema, saveEmployeePrimaryBodySchema, saveEmployeeSecondaryBodySchema, listMonthlyStockQuerySchema, listPaymentsQuerySchema, paymentTotalsQuerySchema, recordPaymentBodySchema, saveStatementBodySchema, statementQuerySchema, listOrdersQuerySchema, missingQuerySchema, monthlyStockBodySchema, orderIdParamsSchema, placeOrderBodySchema, unlockBodySchema } from './sales.schemas.js';

const TAG = 'Sales';

function doc(method: 'get' | 'post', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny }): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/sales${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.body && { body: { content: { 'application/json': { schema: request.body } } } }) },
    responses: { 200: { description: 'OK' }, 409: { description: 'The month is closed or has not started' } },
  });
}
doc('post', '/monthly-stock', 'Save one outlet’s opening and closing stock for a month, several products at once — due by the month’s last day; an MR for their own Chemists and Distributors, Admin for any', { body: monthlyStockBodySchema });
doc('get', '/monthly-stock', 'Stock counts for my outlets — a manager also sees their downline’s, Admin all', { query: listMonthlyStockQuerySchema });
doc('post', '/monthly-stock/unlock', 'Admin: reopen a month after its deadline', { body: unlockBodySchema });
doc('get', '/monthly-stock/missing', 'Outlets with no stock count for a month, by MR — a manager’s downline, or everyone for Admin', { query: missingQuerySchema });
doc('post', '/orders', 'Place an order for one of my Chemists or Distributors, several products at once — amounts are worked out from quantity and unit price; no approval', { body: placeOrderBodySchema });
doc('get', '/orders', 'Orders — my own; a manager also sees their downline’s, Admin all; filter by status, dates, outlet', { query: listOrdersQuerySchema });
doc('post', '/distributor-payments', 'Admin or Accountant: record money received from a distributor (date not in the future, open financial year)', { body: recordPaymentBodySchema });
doc('get', '/distributor-payments', 'Admin or Accountant: one distributor’s payments in a date range, with the total collected and the total ordered', { query: listPaymentsQuerySchema });
doc('get', '/distributor-statement', 'Admin: one distributor\'s month by product — field counts, orders, the saved statement and the figures that follow', { query: statementQuerySchema });
doc('get', '/employee-sales', 'An employee\'s month by product — their Done distributor orders (primary), Admin\'s change and the secondary entered; self, the manager above, or Admin', { query: employeeSalesQuerySchema });
doc('post', '/employee-secondary', 'The secondary an employee sold, per product and month (their achievement): the employee, the manager above, or Admin; the stock deadline applies except to Admin', { body: saveEmployeeSecondaryBodySchema });
doc('post', '/employee-primary', 'Admin: change an employee\'s primary for a month, per product, with a reason (any past month of an open financial year)', { body: saveEmployeePrimaryBodySchema });
doc('post', '/distributor-statement', 'Admin: save the month\'s statement lines (opening, secondary, adjustment with a reason); any past month, an open financial year', { body: saveStatementBodySchema });
doc('get', '/distributor-payments/totals', 'Admin or Accountant: what each distributor paid in a date range (recorded payments only)', { query: paymentTotalsQuerySchema });
openApiRegistry.registerPath({ method: 'post', path: '/api/sales/distributor-payments/{id}/cancel', tags: [TAG], summary: 'Admin or Accountant: cancel a recorded payment, with a reason; a 409 if it is already cancelled', security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema, body: { content: { 'application/json': { schema: cancelPaymentBodySchema } } } }, responses: { 200: { description: 'OK' }, 409: { description: 'Already cancelled' } } });
for (const [path, summary] of [
  ['/orders/{id}', 'One order with its lines'],
  ['/orders/{id}/complete', 'Mark a PLACED order DONE — the MR who placed it, or Admin; a 409 if it is not PLACED'],
  ['/orders/{id}/cancel', 'Cancel a PLACED order — the MR who placed it, or Admin; a 409 if it is not PLACED'],
] as const) {
  openApiRegistry.registerPath({ method: path === '/orders/{id}' ? 'get' : 'post', path: `/api/sales${path}`, tags: [TAG], summary, security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema }, responses: { 200: { description: 'OK' }, 409: { description: 'The order is not PLACED' } } });
}

export function buildSalesRouter(c: SalesHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/monthly-stock', requireRole('FIELD', 'ADMIN'), validate({ body: monthlyStockBodySchema }), c.recordStock);
  router.get('/monthly-stock', requireRole('FIELD', 'ADMIN'), validate({ query: listMonthlyStockQuerySchema }), c.listStock);
  router.post('/monthly-stock/unlock', requireRole('ADMIN'), validate({ body: unlockBodySchema }), c.unlockMonth);
  router.get('/monthly-stock/missing', requireRole('FIELD', 'ADMIN'), validate({ query: missingQuerySchema }), c.missingStock);
  router.post('/distributor-payments', requireRole('ACCOUNTANT', 'ADMIN'), validate({ body: recordPaymentBodySchema }), c.recordPayment);
  router.get('/distributor-payments', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: listPaymentsQuerySchema }), c.listPayments);
  router.get('/distributor-statement', requireRole('ADMIN'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: statementQuerySchema }), c.readStatement);
  router.get('/employee-sales', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: employeeSalesQuerySchema }), c.readEmployeeSales);
  router.post('/employee-secondary', requireRole('ADMIN', 'FIELD'), validate({ body: saveEmployeeSecondaryBodySchema }), c.saveEmployeeSecondary);
  router.post('/employee-primary', requireRole('ADMIN'), validate({ body: saveEmployeePrimaryBodySchema }), c.saveEmployeePrimary);
  router.post('/distributor-statement', requireRole('ADMIN'), validate({ body: saveStatementBodySchema }), c.saveStatement);
  router.get('/distributor-payments/totals', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: paymentTotalsQuerySchema }), c.paymentTotals);
  router.post('/distributor-payments/:id/cancel', requireRole('ACCOUNTANT', 'ADMIN'), validate({ params: orderIdParamsSchema, body: cancelPaymentBodySchema }), c.cancelPayment);
  router.post('/orders', requireRole('FIELD'), validate({ body: placeOrderBodySchema }), c.placeOrder);
  router.get('/orders', requireRole('FIELD', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listOrdersQuerySchema }), c.listOrders);
  router.get('/orders/:id', requireRole('FIELD', 'ADMIN'), validate({ params: orderIdParamsSchema }), c.getOrder);
  router.post('/orders/:id/complete', requireRole('FIELD', 'ADMIN'), validate({ params: orderIdParamsSchema }), c.completeOrder);
  router.post('/orders/:id/cancel', requireRole('FIELD', 'ADMIN'), validate({ params: orderIdParamsSchema }), c.cancelOrder);
  return router;
}
