import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import type { makeListOrgChildrenController } from './users.controller.js';
import { orgChildrenQuerySchema } from './users.schemas.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/identity/org/children',
  tags: ['Identity / Organisation'],
  summary: 'Admin/HR: one level of the organisation tree — the people under `parentId`, or the top of the tree when it is left out. Paged, by name, each with a direct-report count',
  security: [{ bearerAuth: [] }],
  request: { query: orgChildrenQuerySchema },
  responses: { 200: { description: 'Paginated people' } },
});

export function buildOrgRouter(controllers: { children: ReturnType<typeof makeListOrgChildrenController> }): Router {
  const router = Router();
  router.get('/children', authenticate(), requireRole('ADMIN', 'HR'), validate({ query: orgChildrenQuerySchema }), controllers.children);
  return router;
}
