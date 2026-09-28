import { Router } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { MastersHandlers } from './hr.controller.js';
import {
  createHolidayBodySchema,
  createLeaveTypeBodySchema,
  holidayQueryObject,
  idParamsSchema,
  leavePolicyParamsSchema,
  listHolidaysQuerySchema,
  setLeavePolicyBodySchema,
  updateLeaveTypeBodySchema,
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
