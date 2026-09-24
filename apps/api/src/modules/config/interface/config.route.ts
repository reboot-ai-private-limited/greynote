import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { configKeyParamsSchema, updateConfigBodySchema } from './config.schemas.js';
import type { makeUpdateConfigController } from './config.controller.js';

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/config/{key}',
  tags: ['Config'],
  summary: 'Admin: update a SystemConfig value at runtime (e.g. DCR_MISS_GRACE_DAYS)',
  security: [{ bearerAuth: [] }],
  request: {
    params: configKeyParamsSchema,
    body: { content: { 'application/json': { schema: updateConfigBodySchema } } },
  },
  responses: {
    200: { description: 'Config value updated' },
    404: { description: 'Unknown config key' },
  },
});

export function buildConfigRouter(controllers: {
  update: ReturnType<typeof makeUpdateConfigController>;
}): Router {
  const router = Router();

  router.patch(
    '/:key',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: configKeyParamsSchema, body: updateConfigBodySchema }),
    controllers.update,
  );

  return router;
}
