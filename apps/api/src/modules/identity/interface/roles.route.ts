import { Router } from 'express';
import type { RoleName } from '@greynote/contracts';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { CreateRoleUseCase } from '../application/usecases/createRole.usecase.js';
import type { ListRolesUseCase } from '../application/usecases/listRoles.usecase.js';
import type { UpdateRoleUseCase } from '../application/usecases/updateRole.usecase.js';
import type { Role } from '../domain/role.entity.js';
import { makeMasterDataController } from './masterData.controller.js';
import { createRoleBodySchema, masterDataIdParamsSchema, updateRoleBodySchema } from './masterData.schemas.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/roles',
  tags: ['Identity / Roles'],
  summary: 'Admin: list roles',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Roles listed' } },
});
openApiRegistry.registerPath({
  method: 'post',
  path: '/api/identity/roles',
  tags: ['Identity / Roles'],
  summary: 'Admin: create a role',
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createRoleBodySchema } } } },
  responses: { 201: { description: 'Role created' } },
});
openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/identity/roles/{id}',
  tags: ['Identity / Roles'],
  summary: 'Admin: update a role',
  security: [{ bearerAuth: [] }],
  request: {
    params: masterDataIdParamsSchema,
    body: { content: { 'application/json': { schema: updateRoleBodySchema } } },
  },
  responses: { 200: { description: 'Role updated' } },
});

export function buildRolesRouter(useCases: {
  list: ListRolesUseCase;
  create: CreateRoleUseCase;
  update: UpdateRoleUseCase;
}): Router {
  const router = Router();
  const controller = makeMasterDataController<Role, { name: RoleName }, { name: RoleName }>(
    {
      list: useCases.list,
      create: { execute: (input) => useCases.create.execute(input.name) },
      update: { execute: (id, input) => useCases.update.execute(id, input.name) },
    },
    'Role',
  );

  router.get('/', authenticate(), requireRole('ADMIN'), controller.list);
  router.post('/', authenticate(), requireRole('ADMIN'), validate({ body: createRoleBodySchema }), controller.create);
  router.patch(
    '/:id',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: masterDataIdParamsSchema, body: updateRoleBodySchema }),
    controller.update,
  );

  return router;
}
