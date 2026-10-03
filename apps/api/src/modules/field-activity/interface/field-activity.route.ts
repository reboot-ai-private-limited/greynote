import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { FieldActivityHandlers } from './field-activity.controller.js';
import { listExpensesQuerySchema, allocateGiftBodySchema, callParamsSchema, doctorServiceFieldsSchema, idParamsSchema, listGiftsQuerySchema, listServicesQuerySchema, overrideBodySchema, listDcrsQuerySchema, listTeamDcrsQuerySchema } from './field-activity.schemas.js';

const TAG = 'Field Activity';

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

doc('/doctor-services', 'My Doctor Services with their approval status — Admin: everyone’s, optionally by userId / doctorId', { query: listServicesQuerySchema });
doc('/doctor-services/{id}', 'One Doctor Service by its own id — what an approval request points at; Admin, or the MR it is tied to', { params: idParamsSchema });
doc('/doctor-gifts', 'Gifts for my Doctors, pending and done — Admin: all', { query: listGiftsQuerySchema });
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
  router.get('/expenses', requireRole('ACCOUNTANT', 'ADMIN'), scopeToFinancialYear({ kind: 'date', from: 'from', to: 'to', fill: true }), validate({ query: listExpensesQuerySchema }), c.listExpenses);
  router.post('/expenses/:id/mark-paid', requireRole('ACCOUNTANT', 'ADMIN'), validate({ params: idParamsSchema }), c.markExpensePaid);
  router.get('/doctor-services', requireRole('FIELD', 'ADMIN'), validate({ query: listServicesQuerySchema }), c.listServices);
  router.get('/doctor-services/:id', requireRole('FIELD', 'ADMIN'), validate({ params: idParamsSchema }), c.getService);
  router.get('/doctor-gifts', requireRole('FIELD', 'ADMIN'), validate({ query: listGiftsQuerySchema }), c.listGifts);
  router.post('/admin/doctor-services', requireRole('ADMIN'), validate({ body: doctorServiceFieldsSchema }), c.createAdminService);
  router.post('/admin/doctor-gifts', requireRole('ADMIN'), validate({ body: allocateGiftBodySchema }), c.allocateGift);
  return router;
}
