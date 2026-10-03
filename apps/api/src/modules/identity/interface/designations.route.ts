import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreateDesignationUseCase } from '../application/usecases/createDesignation.usecase.js';
import type { ListDesignationsUseCase } from '../application/usecases/listDesignations.usecase.js';
import type { UpdateDesignationUseCase } from '../application/usecases/updateDesignation.usecase.js';
import type { Designation } from '../domain/designation.entity.js';
import { makeMasterDataController } from './masterData.controller.js';
import {
  createDesignationBodySchema,
  masterDataIdParamsSchema,
  updateDesignationBodySchema,
} from './masterData.schemas.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/designations',
  tags: ['Identity / Designations'],
  summary: 'Admin/HR: list designations',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Designations listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/designations',
  tags: ['Identity / Designations'],
  summary: 'Admin/HR: create a designation',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createDesignationBodySchema } } } },
  responses: { 201: { description: 'Designation created' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/identity/designations/{id}',
  tags: ['Identity / Designations'],
  summary: 'Admin/HR: update a designation',
  security: [{ bearerAuth: [] }],
  request: {
    params: masterDataIdParamsSchema,
    body: { content: { 'application/json': { schema: updateDesignationBodySchema } } },
  },
  responses: { 200: { description: 'Designation updated' } },
});

export function buildDesignationsRouter(useCases: {
  list: ListDesignationsUseCase;
  create: CreateDesignationUseCase;
  update: UpdateDesignationUseCase;
}): Router {
  const router = Router();
  const controller = makeMasterDataController<Designation, Omit<Designation, 'id'>, Partial<Omit<Designation, 'id'>>>(
    useCases,
    'Designation',
  );

  router.get('/', authenticate(), requireRole('ADMIN', 'HR'), controller.list);
  router.post(
    '/',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ body: createDesignationBodySchema }),
    controller.create,
  );
  router.patch(
    '/:id',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ params: masterDataIdParamsSchema, body: updateDesignationBodySchema }),
    controller.update,
  );

  return router;
}
