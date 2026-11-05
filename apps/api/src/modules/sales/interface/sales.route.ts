import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError } from '@/shared/errors/AppError.js';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { SalesHandlers } from './sales.controller.js';
import { MAX_SECONDARY_ATTACHMENT_BYTES } from '../domain/secondaryAttachment.entity.js';
import { editSecondaryStockBodySchema, secondaryReportQuerySchema, saveSecondaryStockBodySchema, submitStockCountsBodySchema, stockCountsQuerySchema, secondaryAttachmentBodySchema, cancelPaymentBodySchema, listMonthlyStockQuerySchema, listPaymentsQuerySchema, paymentTotalsQuerySchema, recordPaymentBodySchema, saveStatementBodySchema, statementQuerySchema, listOrdersQuerySchema, missingQuerySchema, monthlyStockBodySchema, orderIdParamsSchema, placeOrderBodySchema, placeOrderForBodySchema, editOrderBodySchema, completeOrderBodySchema, listInvoicesQuerySchema, setInvoiceNumberBodySchema, unlockBodySchema } from './sales.schemas.js';

const TAG = 'Sales';

const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SECONDARY_ATTACHMENT_BYTES, files: 1 } }).single('file');
/** Converts multer's error-first callback (a file over 5 MB, a bad upload) into the same AppError path everything else uses. */
function fileUpload(req: Request, res: Response, next: NextFunction): void {
  uploadFile(req, res, (err: unknown) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
      next(AppError.badRequest(tooBig ? 'That file is over 5 MB.' : err instanceof Error ? err.message : 'Invalid file upload.', { field: 'file' }));
      return;
    }
    next();
  });
}

function doc(method: 'get' | 'post' | 'patch', path: string, summary: string, request: { query?: ZodTypeAny; body?: ZodTypeAny }): void {
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
doc('post', '/orders/on-behalf', 'Admin or Accountant: add an order for a field employee (credited to them), to a distributor or one chemist', { body: placeOrderForBodySchema });
openApiRegistry.registerPath({ method: 'patch', path: '/api/sales/orders/{id}', tags: [TAG], summary: 'Admin or Accountant: change a PLACED order\'s lines, prices and remarks; a 409 if it is no longer PLACED', security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema, body: { content: { 'application/json': { schema: editOrderBodySchema } } } }, responses: { 200: { description: 'OK' }, 409: { description: 'The order is not PLACED' } } });
doc('get', '/orders', 'Orders — my own; a manager also sees their downline’s, Admin all; filter by status, dates, outlet', { query: listOrdersQuerySchema });
doc('post', '/distributor-payments', 'Admin or Accountant: record money received from a distributor (date not in the future, open financial year)', { body: recordPaymentBodySchema });
doc('get', '/distributor-payments', 'Admin or Accountant: one distributor’s payments in a date range, with the total collected and the total ordered', { query: listPaymentsQuerySchema });
doc('get', '/distributor-statement', 'Admin and the Accountant (read only): one distributor\'s month by product — field counts, orders, the saved statement and the figures that follow', { query: statementQuerySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/sales/employee-secondary/attachments',
  tags: [TAG],
  summary: 'Attach a PDF, JPG or PNG (up to 5 MB, any number per month) to an employee’s secondary for a month — multipart: file, month, userId (optional); the employee while the month is a draft, or the manager above, or Admin',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'multipart/form-data': { schema: secondaryAttachmentBodySchema } } } },
  responses: { 201: { description: 'Attached' }, 409: { description: 'The month is closed, or waiting for approval or approved' } },
});
openApiRegistry.registerPath({ method: 'delete', path: '/api/sales/employee-secondary/attachments/{id}', tags: [TAG], summary: 'Remove one attached file, under the same rules as adding it', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Removed' } } });
doc('get', '/secondary-report', 'A manager\'s approved secondary sales for a month: the MRs below them summed by distributor and product (units, and value at PTS), with each MR under the row; never their own, never a manager roll-up on top. Admin may pass managerId', { query: secondaryReportQuerySchema });
doc('post', '/secondary-stock', 'An MR saves a month of secondary stock as a draft, per distributor and product, in units: opening, primary (received), issued (secondary). Closing is derived; MR only', { body: saveSecondaryStockBodySchema });
doc('patch', '/secondary-stock', 'The manager above an MR (or Admin) corrects figures the MR already sent, while the month waits for approval: a reason is required, the MR\'s original figures are kept on the line and shown to the approver; the MR saving again clears the correction', { body: editSecondaryStockBodySchema });
doc('post', '/secondary-rollup/submit', 'A manager sends their team\'s month of secondary sales (the sum of the approved MR reports below them, read-only) to their own manager for approval; the snapshot with their designation then and a reference to each MR\'s approved report is saved, and once approved is their personal achievement for the month', { body: submitStockCountsBodySchema });
doc('get', '/secondary-rollup', 'A manager\'s month of team secondary sales: the live sum before it is sent, the saved snapshot after, with the MR reports it rests on and whether one has changed since (out of date); the manager, the manager above, or Admin', { query: stockCountsQuerySchema });
doc('post', '/secondary-stock/submit', 'The MR sends the month of secondary stock to their manager for approval; only approved rows count', { body: submitStockCountsBodySchema });
doc('get', '/secondary-stock', 'An MR\'s month of secondary stock by distributor and product, with opening/primary defaults, closing and value at PTS; the MR, the manager above, or Admin', { query: stockCountsQuerySchema });
doc('get', '/stock-counts/impact', 'Admin: what deleting an employee\'s month of distributor counts would remove', { query: stockCountsQuerySchema });
openApiRegistry.registerPath({ method: 'delete', path: '/api/sales/stock-counts', tags: [TAG], summary: 'Admin: delete an employee\'s month of secondary sales (rows, team report, files) and its approval requests, so they can enter and send it again', security: [{ bearerAuth: [] }], request: { query: stockCountsQuerySchema as AnyZodObject }, responses: { 200: { description: 'Deleted' }, 409: { description: 'The month has not started, or its financial year is closed' } } });
doc('post', '/distributor-statement', 'Admin: save the month\'s statement lines (opening, secondary, adjustment with a reason); any past month, an open financial year', { body: saveStatementBodySchema });
openApiRegistry.registerPath({ method: 'get', path: '/api/sales/distributor-payments/balances', tags: [TAG], summary: 'Admin or Accountant: what each distributor was delivered (Done orders, free units excluded) and paid, all time — the Dues column adds each distributor\'s opening dues', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/sales/distributor-payments/outstanding', tags: [TAG], summary: 'Admin or Accountant: what all distributors owe together (opening dues + delivered − collected, all time)', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } });
doc('get', '/distributor-payments/totals', 'Admin or Accountant: what each distributor paid in a date range (recorded payments only)', { query: paymentTotalsQuerySchema });
openApiRegistry.registerPath({ method: 'post', path: '/api/sales/distributor-payments/{id}/cancel', tags: [TAG], summary: 'Admin or Accountant: cancel a recorded payment, with a reason; a 409 if it is already cancelled', security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema, body: { content: { 'application/json': { schema: cancelPaymentBodySchema } } } }, responses: { 200: { description: 'OK' }, 409: { description: 'Already cancelled' } } });
doc('get', '/invoices', 'Admin or Accountant: Done distributor orders that have an invoice number, with total, paid (payment allocations) and due; filter by distributorId, status (UNPAID/PARTIAL/PAID) and the order-date range', { query: listInvoicesQuerySchema });
openApiRegistry.registerPath({ method: 'get', path: '/api/sales/invoices/{id}', tags: [TAG], summary: 'Admin or Accountant: one invoice (the order id) with its lines, GST and round-off, for printing', security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema }, responses: { 200: { description: 'OK' }, 404: { description: 'No such invoice' } } });
for (const [path, summary] of [
  ['/orders/{id}', 'One order with its lines'],
  ['/orders/{id}/complete', 'Admin or the Accountant: mark a PLACED order DONE with its `invoiceNumber` (required, unique), delivered in full or, with `supply` (per product: suppliedQty, freeQty), a part supply and free units; the GST invoice is frozen on the order; a 409 if it is not PLACED or the number is used'],
  ['/orders/{id}/invoice-number', 'Admin or the Accountant: give a Done order from before invoices its `invoiceNumber`; a 409 if it already has one or the number is used'],
  ['/orders/{id}/cancel', 'Cancel a PLACED order — the MR who placed it, or Admin; a 409 if it is not PLACED'],
] as const) {
  openApiRegistry.registerPath({ method: path === '/orders/{id}' ? 'get' : path === '/orders/{id}/invoice-number' ? 'patch' : 'post', path: `/api/sales${path}`, tags: [TAG], summary, security: [{ bearerAuth: [] }], request: { params: orderIdParamsSchema }, responses: { 200: { description: 'OK' }, 409: { description: 'The order is not PLACED' } } });
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
  router.get('/distributor-statement', requireRole('ADMIN', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: statementQuerySchema }), c.readStatement);
  router.get('/secondary-report', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: secondaryReportQuerySchema }), c.secondaryReport);
  router.post('/secondary-stock', requireRole('FIELD'), validate({ body: saveSecondaryStockBodySchema }), c.saveSecondaryStock);
  router.patch('/secondary-stock', requireRole('ADMIN', 'FIELD'), validate({ body: editSecondaryStockBodySchema }), c.editSecondaryStock);
  router.post('/secondary-rollup/submit', requireRole('FIELD'), validate({ body: submitStockCountsBodySchema }), c.submitSecondaryRollup);
  router.get('/secondary-rollup', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: stockCountsQuerySchema }), c.readSecondaryRollup);
  router.post('/secondary-stock/submit', requireRole('FIELD'), validate({ body: submitStockCountsBodySchema }), c.submitSecondaryStock);
  router.get('/secondary-stock', requireRole('ADMIN', 'FIELD'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: stockCountsQuerySchema }), c.readSecondaryStock);
  router.get('/stock-counts/impact', requireRole('ADMIN'), scopeToFinancialYear({ kind: 'month', from: 'month', to: 'month', fill: false, single: 'month' }), validate({ query: stockCountsQuerySchema }), c.stockCountsImpact);
  router.delete('/stock-counts', requireRole('ADMIN'), validate({ query: stockCountsQuerySchema }), c.deleteStockCounts);
  router.post('/employee-secondary/attachments', requireRole('ADMIN', 'FIELD'), fileUpload, validate({ body: secondaryAttachmentBodySchema }), c.addSecondaryAttachment);
  router.delete('/employee-secondary/attachments/:id', requireRole('ADMIN', 'FIELD'), validate({ params: orderIdParamsSchema }), c.removeSecondaryAttachment);
  router.post('/distributor-statement', requireRole('ADMIN'), validate({ body: saveStatementBodySchema }), c.saveStatement);
  router.get('/distributor-payments/balances', requireRole('ACCOUNTANT', 'ADMIN'), c.distributorBalances);
  router.get('/distributor-payments/outstanding', requireRole('ACCOUNTANT', 'ADMIN'), c.distributorOutstanding);
  router.get('/distributor-payments/totals', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: paymentTotalsQuerySchema }), c.paymentTotals);
  router.post('/distributor-payments/:id/cancel', requireRole('ACCOUNTANT', 'ADMIN'), validate({ params: orderIdParamsSchema, body: cancelPaymentBodySchema }), c.cancelPayment);
  router.post('/orders', requireRole('FIELD'), validate({ body: placeOrderBodySchema }), c.placeOrder);
  router.post('/orders/on-behalf', requireRole('ACCOUNTANT', 'ADMIN'), validate({ body: placeOrderForBodySchema }), c.placeOrderFor);
  router.patch('/orders/:id', requireRole('ACCOUNTANT', 'ADMIN'), validate({ params: orderIdParamsSchema, body: editOrderBodySchema }), c.editOrder);
  router.get('/orders', requireRole('FIELD', 'ADMIN', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listOrdersQuerySchema }), c.listOrders);
  router.get('/invoices', requireRole('ADMIN', 'ACCOUNTANT'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: false }), validate({ query: listInvoicesQuerySchema }), c.listInvoices);
  router.get('/invoices/:id', requireRole('ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema }), c.getInvoice);
  router.get('/orders/:id', requireRole('FIELD', 'ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema }), c.getOrder);
  router.post('/orders/:id/complete', requireRole('ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema, body: completeOrderBodySchema }), c.completeOrder);
  router.patch('/orders/:id/invoice-number', requireRole('ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema, body: setInvoiceNumberBodySchema }), c.setInvoiceNumber);
  router.post('/orders/:id/cancel', requireRole('FIELD', 'ADMIN', 'ACCOUNTANT'), validate({ params: orderIdParamsSchema }), c.cancelOrder);
  return router;
}
