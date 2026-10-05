import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreateDesignationUseCase } from '../application/usecases/createDesignation.usecase.js';
import type { ListDesignationsUseCase } from '../application/usecases/listDesignations.usecase.js';
import type { Designation, DesignationName } from '../domain/designation.entity.js';
import { makeListCreateController } from './masterData.controller.js';
import {
  createDesignationBodySchema,
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
export function buildDesignationsRouter(useCases: {
  list: ListDesignationsUseCase;
  create: CreateDesignationUseCase;
}): Router {
  const router = Router();
  const controller = makeListCreateController<Designation, { name: DesignationName }>(useCases, 'Designation');

  router.get('/', authenticate(), requireRole('ADMIN', 'HR'), controller.list);
  router.post(
    '/',
    authenticate(),
    requireRole('ADMIN', 'HR'),
    validate({ body: createDesignationBodySchema }),
    controller.create,
  );

  return router;
}
