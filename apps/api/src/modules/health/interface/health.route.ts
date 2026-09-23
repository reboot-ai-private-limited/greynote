import { Router } from 'express';
import type { RequestHandler } from 'express';

export function buildHealthRouter(getHealthController: RequestHandler): Router {
  const router = Router();

  // When someone hits GET /, run the controller!
  router.get('/', getHealthController);

  return router;
}
