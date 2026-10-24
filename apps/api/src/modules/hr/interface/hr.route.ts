import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z, type AnyZodObject, type ZodTypeAny } from 'zod';
import { AppError } from '@/shared/errors/AppError.js';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { MAX_LEAVE_ATTACHMENT_BYTES } from '../domain/leave.entity.js';
import type { BalanceHandlers, LeaveHandlers, MastersHandlers } from './hr.controller.js';
import {
  adjustBalanceBodySchema,
  attachmentParamsSchema,
  balanceParamsSchema,
  balanceQuerySchema,
  createHolidayBodySchema,
  updateHolidayBodySchema,
  updateHolidayQuerySchema,
  deleteHolidayQuerySchema,
  createLeaveTypeBodySchema,
  holidayQueryObject,
  idParamsSchema,
  leaveBodySchema,
  leaveApprovalGrantBodySchema,
  leavesQuerySchema,
  leavePolicyParamsSchema,
  listHolidaysQuerySchema,
  myLeavesQuerySchema,
  setLeavePolicyBodySchema,
  updateLeaveTypeBodySchema,
  userIdParamsSchema,
} from './hr.schemas.js';

const TAG = 'HR';

const uploadProof = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LEAVE_ATTACHMENT_BYTES, files: 1 } }).single('file');
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
const MAX_HOLIDAY_IMPORT_BYTES = 1024 * 1024;
const uploadHolidays = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_HOLIDAY_IMPORT_BYTES, files: 1 } }).single('file');
/** Same multer → AppError bridge as the proof upload. */
function holidayUpload(req: Request, res: Response, next: NextFunction): void {
  uploadHolidays(req, res, (err: unknown) => {
    if (err) {
      next(AppError.badRequest(err instanceof Error ? err.message : 'Invalid file upload.', { field: 'file' }));
      return;
    }
    next();
  });
}
const holidayImportQuerySchema = z.object({ dryRun: z.enum(['true', 'false']).optional() });
const bearer = [{ bearerAuth: [] }];
const json = (schema: ZodTypeAny) => ({ content: { 'application/json': { schema } } });

export function doc(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  summary: string,
  request: { query?: AnyZodObject; params?: AnyZodObject; body?: ZodTypeAny } = {},
): void {
  openApiRegistry.registerPath({
    method,
    path: `/api/hr${path}`,
    tags: [TAG],
    summary,
    security: bearer,
    request: {
      ...(request.query && { query: request.query }),
      ...(request.params && { params: request.params }),
      ...(request.body && { body: json(request.body) }),
    },
    responses: { 200: { description: 'OK' } },
  });
}

doc('get', '/leave-types', 'Leave types');
doc('post', '/leave-types', 'HR/Admin: add a leave type', { body: createLeaveTypeBodySchema });
doc('patch', '/leave-types/{id}', 'HR/Admin: rename, (de)activate, or change isPaid while unused', { params: idParamsSchema, body: updateLeaveTypeBodySchema });
doc('get', '/leave-policies', 'HR/Admin: the Leave Master — every grade × paid type');
doc('put', '/leave-policies/{payBandId}/{leaveTypeId}', 'HR/Admin: set a grade’s default days per leave year', { params: leavePolicyParamsSchema, body: setLeavePolicyBodySchema });
doc('get', '/holidays', 'Holidays — field staff: the ones that apply to them; HR/Admin: all, filterable', { query: holidayQueryObject });
doc('post', '/holidays', 'HR/Admin: add a National, Zone or HQ holiday — one day, or `date`…`endDate` (at most 31 days, one row per day sharing a groupId); returns the days created', { body: createHolidayBodySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/hr/holidays/import',
  tags: [TAG],
  summary: 'HR/Admin: add holidays in bulk from a CSV',
  description:
    'multipart/form-data with a `file` field (CSV, ≤1 MB, ≤500 rows). Columns: name, date (YYYY-MM-DD), scope (NATIONAL|ZONE|HQ), zones (`;`-separated Zone names), hqs (`;`-separated Zone/HQ). ' +
    'A holiday already on the calendar (same name, date, scope, places) is skipped. Any problem rejects the whole file with every problem listed by line (publicDetails.errors). ' +
    '`?dryRun=true` returns the preview (each row NEW or EXISTS) without writing.',
  security: bearer,
  request: {
    query: holidayImportQuerySchema,
    body: { content: { 'multipart/form-data': { schema: z.object({ file: z.string().openapi({ type: 'string', format: 'binary' }) }) } } },
  },
  responses: { 200: { description: 'Dry run preview' }, 201: { description: 'Imported' }, 400: { description: 'Problems found; nothing written' } },
});
doc('patch', '/holidays/{id}', 'HR/Admin: change a holiday — it is replaced by the fields sent (as an add); with `group=true` every day of its range is replaced; returns the days now on the calendar', { params: idParamsSchema, query: updateHolidayQuerySchema, body: updateHolidayBodySchema });
doc('delete', '/holidays/{id}', 'HR/Admin: remove a holiday day, or with `group=true` every day of its range', { params: idParamsSchema, query: deleteHolidayQuerySchema });
doc('get', '/leave-balances/me', 'Field staff: my leave balances for a leave year (the current one by default)', { query: balanceQuerySchema });
doc('get', '/leave-balances/{userId}', 'An employee’s balances — HR/Admin, or their managers (read-only)', { params: userIdParamsSchema, query: balanceQuerySchema });
doc('patch', '/leave-balances/{userId}/{leaveTypeId}', 'HR/Admin: set one employee’s allocation (never below used + pending)', { params: balanceParamsSchema, body: adjustBalanceBodySchema });
doc('post', '/leaves', 'Field staff: request leave — it goes to your manager, then HR/Admin', { body: leaveBodySchema });
doc('put', '/leaves/{id}', 'Field staff: change a rejected, withdrawn or reopened leave — resubmits it', { params: idParamsSchema, body: leaveBodySchema });
doc('get', '/leaves/me', 'Field staff: my leaves, newest first', { query: myLeavesQuerySchema });
doc('get', '/leaves', 'HR/Admin: everyone’s leaves, newest first', { query: leavesQuerySchema });
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/hr/leaves/{id}/attachments',
  tags: [TAG],
  summary: 'Field staff: attach proof (PDF, JPG or PNG, up to 5 MB, at most 3 per leave) to a leave of a type that takes it — optional',
  security: bearer,
  request: { params: idParamsSchema },
  responses: { 201: { description: 'The leave’s files' }, 400: { description: 'Not a PDF/JPG/PNG, too big, or this leave type takes no proof' }, 409: { description: 'Already 3 files' } },
});
openApiRegistry.registerPath({
  method: 'delete',
  path: '/api/hr/leaves/{id}/attachments/{attachmentId}',
  tags: [TAG],
  summary: 'Field staff: remove a file from my leave',
  security: bearer,
  request: { params: attachmentParamsSchema },
  responses: { 200: { description: 'The leave’s remaining files' }, 404: { description: 'No such leave or file' } },
});
doc('post', '/leaves/{id}/approval-grant', 'Admin: let a leave that has already started be approved, once (409 LEAVE_APPROVAL_LATE otherwise)', { params: idParamsSchema, body: leaveApprovalGrantBodySchema });
doc('delete', '/leaves/{id}/approval-grant', 'Admin: withdraw the open late-approval exception of a leave', { params: idParamsSchema });
doc('get', '/leaves/{id}', 'One leave — the employee, their managers, HR, Admin', { params: idParamsSchema });

/** Leave types, the Leave Master and holidays. */
export function buildMastersRouter(c: MastersHandlers): Router {
  const router = Router();
  router.use(authenticate());
  const hr = requireRole('HR', 'ADMIN');

  router.get('/leave-types', c.listTypes);
  router.post('/leave-types', hr, validate({ body: createLeaveTypeBodySchema }), c.createType);
  router.patch('/leave-types/:id', hr, validate({ params: idParamsSchema, body: updateLeaveTypeBodySchema }), c.updateType);
  router.get('/leave-policies', hr, c.listPolicies);
  router.put('/leave-policies/:payBandId/:leaveTypeId', hr, validate({ params: leavePolicyParamsSchema, body: setLeavePolicyBodySchema }), c.setPolicy);
  router.get('/holidays', validate({ query: listHolidaysQuerySchema }), c.listHolidays);
  router.post('/holidays', hr, validate({ body: createHolidayBodySchema }), c.createHoliday);
  router.post('/holidays/import', hr, validate({ query: holidayImportQuerySchema }), holidayUpload, c.importHolidays);
  router.patch('/holidays/:id', hr, validate({ params: idParamsSchema, query: updateHolidayQuerySchema, body: updateHolidayBodySchema }), c.updateHoliday);
  router.delete('/holidays/:id', hr, validate({ params: idParamsSchema, query: deleteHolidayQuerySchema }), c.deleteHoliday);
  return router;
}

export function buildBalancesRouter(c: BalanceHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.get('/me', requireRole('FIELD'), scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ query: balanceQuerySchema }), c.myBalances);
  // Managers are FIELD too; the use case checks the chain.
  router.get('/:userId', requireRole('FIELD', 'HR', 'ADMIN'), scopeToFinancialYear({ kind: 'year', param: 'year' }), validate({ params: userIdParamsSchema, query: balanceQuerySchema }), c.userBalances);
  router.patch('/:userId/:leaveTypeId', requireRole('HR', 'ADMIN'), validate({ params: balanceParamsSchema, body: adjustBalanceBodySchema }), c.adjustBalance);
  return router;
}

/** Approve, reject and withdraw are `/api/approvals/*` with `kind=LEAVE`. */
export function buildLeavesRouter(c: LeaveHandlers): Router {
  const router = Router();
  router.use(authenticate());
  router.post('/', requireRole('FIELD'), validate({ body: leaveBodySchema }), c.requestLeave);
  router.get('/me', requireRole('FIELD'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: myLeavesQuerySchema }), c.myLeaves);
  router.get('/', requireRole('HR', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: leavesQuerySchema }), c.allLeaves);
  router.put('/:id', requireRole('FIELD'), validate({ params: idParamsSchema, body: leaveBodySchema }), c.editLeave);
  router.get('/:id', validate({ params: idParamsSchema }), c.getLeave);
  router.post('/:id/approval-grant', requireRole('ADMIN'), validate({ params: idParamsSchema, body: leaveApprovalGrantBodySchema }), c.grantApproval);
  router.delete('/:id/approval-grant', requireRole('ADMIN'), validate({ params: idParamsSchema }), c.revokeApproval);
  router.post('/:id/attachments', requireRole('FIELD'), validate({ params: idParamsSchema }), proofUpload, c.addProof);
  router.delete('/:id/attachments/:attachmentId', requireRole('FIELD'), validate({ params: attachmentParamsSchema }), c.removeProof);
  return router;
}
