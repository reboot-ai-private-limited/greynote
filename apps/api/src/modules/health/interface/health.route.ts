import { Router } from 'express';
import type { RequestHandler } from 'express';
import { openApiRegistry } from '@/shared/http/swagger.util.js';

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Report service health',
  responses: {
    200: { description: 'Service is healthy' },
    503: { description: 'Service is degraded' },
  },
});

export function buildHealthRouter(getHealthController: RequestHandler): Router {
  const router = Router();

  // When someone hits GET /, run the controller!
  router.get('/', getHealthController);

  return router;
}
