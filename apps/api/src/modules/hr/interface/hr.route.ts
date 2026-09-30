import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { scopeToFinancialYear } from '@/shared/http/financialYear.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { BalanceHandlers, LeaveHandlers, MastersHandlers } from './hr.controller.js';
import {
  adjustBalanceBodySchema,
  balanceParamsSchema,
  balanceQuerySchema,
  createHolidayBodySchema,
  createLeaveTypeBodySchema,
  holidayQueryObject,
  idParamsSchema,
  leaveBodySchema,
  leavesQuerySchema,
  leavePolicyParamsSchema,
  listHolidaysQuerySchema,
  myLeavesQuerySchema,
  setLeavePolicyBodySchema,
  updateLeaveTypeBodySchema,
  userIdParamsSchema,
} from './hr.schemas.js';

const TAG = 'HR';
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
doc('post', '/holidays', 'HR/Admin: add a National, Zone or HQ holiday', { body: createHolidayBodySchema });
doc('delete', '/holidays/{id}', 'HR/Admin: remove a holiday', { params: idParamsSchema });
doc('get', '/leave-balances/me', 'Field staff: my leave balances for a leave year (the current one by default)', { query: balanceQuerySchema });
doc('get', '/leave-balances/{userId}', 'An employee’s balances — HR/Admin, or their managers (read-only)', { params: userIdParamsSchema, query: balanceQuerySchema });
doc('patch', '/leave-balances/{userId}/{leaveTypeId}', 'HR/Admin: set one employee’s allocation (never below used + pending)', { params: balanceParamsSchema, body: adjustBalanceBodySchema });
doc('post', '/leaves', 'Field staff: request leave — it goes to your manager, then HR/Admin', { body: leaveBodySchema });
doc('put', '/leaves/{id}', 'Field staff: change a rejected, withdrawn or reopened leave — resubmits it', { params: idParamsSchema, body: leaveBodySchema });
doc('get', '/leaves/me', 'Field staff: my leaves, newest first', { query: myLeavesQuerySchema });
doc('get', '/leaves', 'HR/Admin: everyone’s leaves, newest first', { query: leavesQuerySchema });
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
  router.delete('/holidays/:id', hr, validate({ params: idParamsSchema }), c.deleteHoliday);
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
  return router;
}
