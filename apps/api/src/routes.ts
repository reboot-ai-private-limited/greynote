import { Router } from 'express';
import type { AppContainers } from './container.js';

export function buildApiRouter(containers: AppContainers): Router {
  const router = Router();

  // Mount the health module's router under /health
  router.use('/health', containers.health.buildRouter());
  router.use('/config', containers.config.buildRouter());
  router.use('/identity', containers.identity.buildRouter());

  return router;
}
