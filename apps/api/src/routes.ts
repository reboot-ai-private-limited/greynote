import { Router } from 'express';
import type { AppContainers } from './container.js';

export function buildApiRouter(containers: AppContainers): Router {
  const router = Router();

  // Mount the health module's router under /health
  router.use('/health', containers.health.buildRouter());
  router.use('/config', containers.config.buildRouter());
  router.use('/identity', containers.identity.buildRouter());
  router.use('/territory', containers.territory.buildRouter());
  router.use('/approvals', containers.approval.buildRouter());
  router.use('/planning', containers.planning.buildRouter());
  router.use('/hr', containers.hr.buildRouter());
  router.use('/field-master-data', containers.fieldMasterData.buildRouter());
  router.use('/sync', containers.sync.buildRouter());

  return router;
}
