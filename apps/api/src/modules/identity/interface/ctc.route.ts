import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreatePayComponentUseCase } from '../application/usecases/createPayComponent.usecase.js';
import type { ListPayComponentsUseCase } from '../application/usecases/listPayComponents.usecase.js';
import type { UpdatePayComponentUseCase } from '../application/usecases/updatePayComponent.usecase.js';
import type { PayComponent } from '../domain/payComponent.entity.js';
import type { makeCtcControllers } from './ctc.controller.js';
import {
  assignCtcBodySchema,
  createPayComponentBodySchema,
  ctcUserParamsSchema,
  previewCtcBodySchema,
  reapplyCtcBodySchema,
  updatePayComponentBodySchema,
} from './ctc.schemas.js';
import { makeMasterDataController } from './masterData.controller.js';
import { masterDataIdParamsSchema } from './masterData.schemas.js';

const tags = ['Identity / CTC'];
const security = [{ bearerAuth: [] }];
openApiRegistry.registerPath({ method: 'get', path: '/api/identity/pay-components', tags, summary: 'Admin/HR/Accountant: the org-wide CTC formula', security, responses: { 200: { description: 'Components listed' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/pay-components', tags, summary: 'Admin: add a pay component', security, request: { body: { content: { 'application/json': { schema: createPayComponentBodySchema } } } }, responses: { 201: { description: 'Created' } } });
openApiRegistry.registerPath({ method: 'patch', path: '/api/identity/pay-components/{id}', tags, summary: 'Admin: edit a pay component', security, request: { params: masterDataIdParamsSchema, body: { content: { 'application/json': { schema: updatePayComponentBodySchema } } } }, responses: { 200: { description: 'Updated' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/ctc/preview', tags, summary: 'Admin/HR: compute a CTC breakdown without saving', security, request: { body: { content: { 'application/json': { schema: previewCtcBodySchema } } } }, responses: { 200: { description: 'Breakdown' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/ctc/reapply', tags, summary: 'Admin/HR: new revision for employees from the current formula', security, request: { body: { content: { 'application/json': { schema: reapplyCtcBodySchema } } } }, responses: { 200: { description: 'Per-employee outcomes' } } });
openApiRegistry.registerPath({ method: 'get', path: '/api/identity/users/{id}/ctc', tags, summary: 'Admin/HR/Accountant: an employee\'s CTC revisions', security, request: { params: ctcUserParamsSchema }, responses: { 200: { description: 'History' } } });
openApiRegistry.registerPath({ method: 'post', path: '/api/identity/users/{id}/ctc', tags, summary: 'Admin/HR: save a new CTC revision', security, request: { params: ctcUserParamsSchema, body: { content: { 'application/json': { schema: assignCtcBodySchema } } } }, responses: { 201: { description: 'Revision saved' } } });

export function buildPayComponentsRouter(useCases: {
  list: ListPayComponentsUseCase;
  create: CreatePayComponentUseCase;
  update: UpdatePayComponentUseCase;
}): Router {
  const router = Router();
  const controller = makeMasterDataController<PayComponent, Omit<PayComponent, 'id'>, Partial<Omit<PayComponent, 'id' | 'code'>>>(useCases, 'Pay component');
  router.get('/', authenticate(), requireRole('ADMIN', 'HR', 'ACCOUNTANT'), controller.list);
  router.post('/', authenticate(), requireRole('ADMIN'), validate({ body: createPayComponentBodySchema }), controller.create);
  router.patch('/:id', authenticate(), requireRole('ADMIN'), validate({ params: masterDataIdParamsSchema, body: updatePayComponentBodySchema }), controller.update);
  return router;
}

export function buildCtcRouter(controllers: ReturnType<typeof makeCtcControllers>): Router {
  const router = Router();
  router.post('/preview', authenticate(), requireRole('ADMIN', 'HR'), validate({ body: previewCtcBodySchema }), controllers.preview);
  router.post('/reapply', authenticate(), requireRole('ADMIN', 'HR'), validate({ body: reapplyCtcBodySchema }), controllers.reapply);
  return router;
}

/** Mounted under `/users`, ahead of the users router, for `/users/:id/ctc`. */
export function buildUserCtcRouter(controllers: ReturnType<typeof makeCtcControllers>): Router {
  const router = Router();
  router.get('/:id/ctc', authenticate(), requireRole('ADMIN', 'HR', 'ACCOUNTANT'), validate({ params: ctcUserParamsSchema }), controllers.history);
  router.post('/:id/ctc', authenticate(), requireRole('ADMIN', 'HR'), validate({ params: ctcUserParamsSchema, body: assignCtcBodySchema }), controllers.assign);
  return router;
}
