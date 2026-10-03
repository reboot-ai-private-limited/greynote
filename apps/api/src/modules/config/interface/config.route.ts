import { Router } from 'express';
import { authenticate } from '@/shared/http/authenticate.middleware.js';
import { requireRole } from '@/shared/http/authorize.middleware.js';
import { validate } from '@/shared/http/validate.middleware.js';
import { openApiRegistry } from '@/shared/http/swagger.util.js';
import { configKeyParamsSchema, updateConfigBodySchema } from './config.schemas.js';
import type { makeListConfigController, makePublicConfigController, makeUpdateConfigController } from './config.controller.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/config/public',
  tags: ['Config'],
  summary: 'Any signed-in user: the financial-year start month and the business timezone, so clients read dates as the server does',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'Public settings' } },
});
openApiRegistry.registerPath({
  method: 'get',
  path: '/api/config',
  tags: ['Config'],
  summary: 'Admin: every system setting with its value, type, limits, default and impact',
  security: [{ bearerAuth: [] }],
  responses: { 200: { description: 'System settings' } },
});
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
  list: ReturnType<typeof makeListConfigController>;
  publicSettings: ReturnType<typeof makePublicConfigController>;
  update: ReturnType<typeof makeUpdateConfigController>;
}): Router {
  const router = Router();

  router.get('/public', authenticate(), controllers.publicSettings);
  router.get('/', authenticate(), requireRole('ADMIN'), controllers.list);
  router.patch(
    '/:key',
    authenticate(),
    requireRole('ADMIN'),
    validate({ params: configKeyParamsSchema, body: updateConfigBodySchema }),
    controllers.update,
  );

  return router;
}
