import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { AppError } from '@/shared/errors/AppError.js';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { MAX_EXPENSE_ATTACHMENT_BYTES } from '../domain/expense.entity.js';
import type { FieldActivityHandlers } from './field-activity.controller.js';
import { grantExpenseMonthBodySchema, listExpenseGrantsQuerySchema, expenseAttachmentParamsSchema, expenseHistoryQuerySchema, expenseMonthParamsSchema, expenseMonthQuerySchema, otherExpenseBodySchema, listExpensesQuerySchema, listExpensePayoutsQuerySchema, payExpensesBodySchema, allocateGiftBodySchema, callParamsSchema, doctorServiceFieldsSchema, idParamsSchema, listGiftsQuerySchema, listServicesQuerySchema, overrideBodySchema, listDcrsQuerySchema, listTeamDcrsQuerySchema } from './field-activity.schemas.js';

const TAG = 'Field Activity';

const uploadProof = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_EXPENSE_ATTACHMENT_BYTES, files: 1 } }).single('file');
/** Converts multer's error-first callback (a bad file, a file over 5 MB) into the same AppError path everything else uses. */
function proofUpload(req: Request, res: Response, next: NextFunction): void {
  uploadProof(req, res, (err: unknown) => {
    if (err) {
      const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
      next(AppError.badRequest(tooBig ? 'That file is over 5 MB.' : err instanceof Error ? err.message : 'Invalid file upload.', { field: 'file' }));
      return;
    }
    next();
  });
}

function doc(path: string, summary: string, request: { query?: ZodTypeAny; params?: AnyZodObject } = {}): void {
  openApiRegistry.registerPath({
    method: 'get',
    path: `/api/field-activity${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { ...(request.query && { query: request.query as AnyZodObject }), ...(request.params && { params: request.params }) },
    responses: { 200: { description: 'OK' } },
  });
}

doc('/dcr', 'My daily reports in a date range — Admin: anyone’s, named by userId', { query: listDcrsQuerySchema });
doc('/dcr/team', 'My downline’s daily reports in a date range, read-only', { query: listTeamDcrsQuerySchema });
doc('/dcr/{id}', 'One daily report — the owner, their managers, Admin', { params: idParamsSchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/dcr/{id}/calls/{callId}/override-geofence',
  tags: [TAG],
  summary: 'Accept a call the geofence flagged (FAIL / UNVERIFIED) — the reviewing manager, or Admin; a comment is required',
  security: [{ bearerAuth: [] }],
  request: { params: callParamsSchema, body: { content: { 'application/json': { schema: overrideBodySchema } } } },
  responses: { 200: { description: 'The call, now OVERRIDE' }, 409: { description: 'Not under review, passed, or already accepted' } },
});

openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/field-activity/dcr/{id}/calls/{callId}',
  tags: [TAG],
  summary: 'Remove one doctor or chemist call from my own report before it is submitted (samples go back to the allocation)',
  security: [{ bearerAuth: [] }],
  request: { params: callParamsSchema },
  responses: { 200: { description: 'Removed' }, 404: { description: 'No such call on one of your reports' }, 409: { description: 'The report has been submitted' } },
});
openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/field-activity/dcr/{id}/followups/{callId}',
  tags: [TAG],
  summary: 'Remove one follow-up from my own report before it is submitted',
  security: [{ bearerAuth: [] }],
  request: { params: callParamsSchema },
  responses: { 200: { description: 'Removed' }, 404: { description: 'No such follow-up on one of your reports' }, 409: { description: 'The report has been submitted' } },
});

doc('/doctor-services', 'My Doctor Services with their approval status — Admin: everyone’s, optionally by userId / doctorId', { query: listServicesQuerySchema });
doc('/doctor-services/{id}', 'One Doctor Service by its own id — what an approval request points at; Admin, or the MR it is tied to', { params: idParamsSchema });
doc('/doctor-gifts', 'Gifts for my Doctors, pending and done — Admin: all', { query: listGiftsQuerySchema });
doc('/expense-payouts', 'Accountant: one month’s accepted expenses per employee — what is unpaid and what is paid — with the day they are due', { query: listExpensePayoutsQuerySchema });
doc('/expenses', 'Accountant: expenses whose report the manager accepted, unpaid first — a date range is required', { query: listExpensesQuerySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/expenses/{id}/mark-paid',
  tags: [TAG],
  summary: 'Accountant: settle an accepted expense. Idempotent; a cancelled or not-yet-approved one is a 409',
  security: [{ bearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'The expense, PAID' }, 409: { description: 'Cancelled, or its report is not approved' } },
});
doc('/expense-months', 'The month’s expense statement — date-wise TA, DA and Other with its approval status. Own; a manager reads their team’s, Admin anyone’s (userId)', { query: expenseMonthQuerySchema });
doc('/expense-months/{id}', 'One month’s statement by its own id — what an approval request points at; the owner, their managers, Admin', { params: idParamsSchema });
doc('/expense-months/history', 'Previous months’ expenses with totals and whether each was approved (default: the last 12)', { query: expenseHistoryQuerySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/expense-months/{month}/submit',
  tags: [TAG],
  summary: 'Send a finished month’s expenses for approval — only after the month has ended; the manager or Admin approves',
  security: [{ bearerAuth: [] }],
  request: { params: expenseMonthParamsSchema },
  responses: { 200: { description: 'The statement, now SUBMITTED' }, 409: { description: 'The month has not ended, or is already sent / approved' } },
});
docPost('/expense-grants', 'Allow one employee’s month of expenses to be sent (SUBMIT) or approved (APPROVE) after its deadline — Admin; a manager for their team while LATE_EXPENSE_GRANT_BY_MANAGER is on. A 409 once any of the month is paid', grantExpenseMonthBodySchema);
doc('/expense-grants', 'Late-expense exceptions, newest first — Admin: all; others: their own and their team’s', { query: listExpenseGrantsQuerySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/expense-grants/{id}/revoke',
  tags: [TAG],
  summary: 'Revoke an unused late-expense exception — Admin, the grantor or a manager of the employee',
  security: [{ bearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 200: { description: 'The exception, REVOKED' }, 409: { description: 'Already used, revoked or expired' } },
});
docPost('/expenses/other', 'Add an expense in the single “Other” category, dated — while the month is still editable', otherExpenseBodySchema);
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/field-activity/expenses/other/{id}/attachments',
  tags: [TAG],
  summary: 'Field staff: attach proof (PDF, JPG or PNG, up to 5 MB, at most 3 per expense) to an Other expense — optional, while the month is still editable',
  security: [{ bearerAuth: [] }],
  request: { params: idParamsSchema },
  responses: { 201: { description: 'The expense’s files' }, 400: { description: 'Not a PDF/JPG/PNG, empty, or too big' }, 409: { description: 'Already 3 files, or the expense can no longer be changed' } },
});
openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/field-activity/expenses/other/{id}/attachments/{attachmentId}',
  tags: [TAG],
  summary: 'Field staff: remove a proof file from an Other expense while the month is still editable',
  security: [{ bearerAuth: [] }],
  request: { params: expenseAttachmentParamsSchema },
  responses: { 200: { description: 'The expense’s remaining files' }, 404: { description: 'No such expense or file' } },
});
function docPost(path: string, summary: string, schema: ZodTypeAny): void {
  openApiRegistry.registerPath({
    method: 'post',
    path: `/api/field-activity${path}`,
    tags: [TAG],
    summary,
    security: [{ bearerAuth: [] }],
    request: { body: { content: { 'application/json': { schema } } } },
    responses: { 201: { description: 'Created' } },
  });
}
docPost('/admin/doctor-services', 'Admin: a Doctor Service, effective at once and tied to the Doctor’s assigned MR', doctorServiceFieldsSchema);
docPost('/admin/doctor-gifts', 'Admin: allocate a gift to a Doctor; the assigned MR marks it done', allocateGiftBodySchema);

/**
 * Reads, plus the geofence override: the day's records arrive through the sync push, and a DCR is approved
 * through `/api/approvals/*` with `kind=DCR` (LLD field-activity.md, *Write path and HTTP surface*).
 */
export function buildFieldActivityRouter(c: FieldActivityHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/dcr', requireRole('FIELD', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listDcrsQuerySchema }), c.listDcrs);
  router.get('/dcr/team', requireRole('FIELD'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listTeamDcrsQuerySchema }), c.teamDcrs);
  router.get('/dcr/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.getDcr);
  router.post('/dcr/:id/calls/:callId/override-geofence', requireRole('FIELD', 'ADMIN'), validate({ params: callParamsSchema, body: overrideBodySchema }), c.overrideGeofence);
  router.delete('/dcr/:id/calls/:callId', requireRole('FIELD'), validate({ params: callParamsSchema }), c.deleteCall);
  router.delete('/dcr/:id/followups/:callId', requireRole('FIELD'), validate({ params: callParamsSchema }), c.deleteFollowup);
  router.get('/expenses', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listExpensesQuerySchema }), c.listExpenses);
  router.get('/expense-payouts', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: listExpensePayoutsQuerySchema }), c.listExpensePayouts);
  router.post('/expense-payouts/pay', requireRole('ACCOUNTANT', 'ADMIN'), validate({ body: payExpensesBodySchema }), c.payExpenses);
  router.post('/expenses/:id/mark-paid', requireRole('ACCOUNTANT', 'ADMIN'), validate({ params: idParamsSchema }), c.markExpensePaid);
  router.get('/expense-months', requireRole('FIELD', 'ADMIN'), scopeToFinancialYear({ kind: 'month', from: 'fromMonth', to: 'toMonth', fill: false, single: 'month' }), validate({ query: expenseMonthQuerySchema }), c.expenseStatement);
  router.get('/expense-months/history', requireRole('FIELD', 'ADMIN'), validate({ query: expenseHistoryQuerySchema }), c.expenseHistory);
  router.get('/expense-months/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.expenseStatementById);
  router.post('/expense-months/:month/submit', requireRole('FIELD'), validate({ params: expenseMonthParamsSchema }), c.submitExpenseMonth);
  router.post('/expense-grants', requireRole('FIELD', 'ADMIN'), validate({ body: grantExpenseMonthBodySchema }), c.grantExpenseMonth);
  router.get('/expense-grants', requireRole('FIELD', 'ADMIN'), validate({ query: listExpenseGrantsQuerySchema }), c.listExpenseGrants);
  router.post('/expense-grants/:id/revoke', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.revokeExpenseGrant);
  router.post('/expenses/other', requireRole('FIELD'), validate({ body: otherExpenseBodySchema }), c.addOtherExpense);
  router.put('/expenses/other/:id', requireRole('FIELD'), validate({ params: idParamsSchema, body: otherExpenseBodySchema }), c.updateOtherExpense);
  router.post('/expenses/other/:id/attachments', requireRole('FIELD'), validate({ params: idParamsSchema }), proofUpload, c.addExpenseProof);
  router.delete('/expenses/other/:id/attachments/:attachmentId', requireRole('FIELD'), validate({ params: expenseAttachmentParamsSchema }), c.removeExpenseProof);
  router.delete('/expenses/other/:id', requireRole('FIELD'), validate({ params: idParamsSchema }), c.deleteOtherExpense);
  router.get('/doctor-services', requireRole('FIELD', 'ADMIN'), validate({ query: listServicesQuerySchema }), c.listServices);
  router.get('/doctor-services/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.getService);
  router.get('/doctor-gifts', requireRole('FIELD', 'ADMIN'), validate({ query: listGiftsQuerySchema }), c.listGifts);
  router.post('/admin/doctor-services', requireRole('ADMIN'), validate({ body: doctorServiceFieldsSchema }), c.createAdminService);
  router.post('/admin/doctor-gifts', requireRole('ADMIN'), validate({ body: allocateGiftBodySchema }), c.allocateGift);
  return router;
}
