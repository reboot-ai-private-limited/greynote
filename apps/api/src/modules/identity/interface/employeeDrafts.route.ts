import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { validate } from '@/shared/http/validate.middleware.js';
import type { makeEmployeeDraftControllers } from './employeeDrafts.controller.js';
import { draftIdParamsSchema, employeeDraftBodySchema } from './employeeDrafts.schemas.js';

const TAG = 'Identity / Employee drafts';
const bearer = [{ bearerAuth: [] }];
const body = { content: { 'application/json': { schema: employeeDraftBodySchema } } };

openApiRegistry.registerPath({ method: 'post', path: '/api/identity/employee-drafts', tags: [TAG], summary: 'Admin/HR: save a new employee onboarding draft', security: bearer, request: { body }, responses: { 201: { description: 'Draft saved' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/identity/employee-drafts', tags: [TAG], summary: 'Admin/HR: list onboarding drafts, newest first', security: bearer, responses: { 200: { description: 'Drafts listed' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/identity/employee-drafts/{id}', tags: [TAG], summary: 'Admin/HR: one onboarding draft', security: bearer, request: { params: draftIdParamsSchema }, responses: { 200: { description: 'Draft' } } });
openApiRegistry.registerPath({ method: 'patch', path: '/api/identity/employee-drafts/{id}', tags: [TAG], summary: 'Admin/HR: save sections of a draft', security: bearer, request: { params: draftIdParamsSchema, body }, responses: { 200: { description: 'Draft saved' } } });
openApiRegistry.registerPath({ method: 'delete', path: '/api/identity/employee-drafts/{id}', tags: [TAG], summary: 'Admin/HR: delete a draft', security: bearer, request: { params: draftIdParamsSchema }, responses: { 200: { description: 'Draft deleted' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/employee-drafts/{id}/finalize', tags: [TAG], summary: 'Admin/HR: create the employee from a complete draft; returns the generated code and password once', security: bearer, request: { params: draftIdParamsSchema }, responses: { 201: { description: 'Employee created' } } });

export function buildEmployeeDraftsRouter(controllers: ReturnType<typeof makeEmployeeDraftControllers>): Router {
  const router = Router();
  router.use(authenticate(), requireRole('ADMIN', 'HR'));
  router.get('/', controllers.list);
  router.post('/', validate({ body: employeeDraftBodySchema }), controllers.create);
  router.get('/:id', validate({ params: draftIdParamsSchema }), controllers.get);
  router.patch('/:id', validate({ params: draftIdParamsSchema, body: employeeDraftBodySchema }), controllers.update);
  router.delete('/:id', validate({ params: draftIdParamsSchema }), controllers.remove);
  router.post('/:id/finalize', validate({ params: draftIdParamsSchema }), controllers.finalize);
  return router;
}
