import { Router } from 'express';
import type { AppContainers } from './container.js';
import { financialYearContext } from '@/shared/http/financialYear.middleware.js';

export function buildApiRouter(containers: AppContainers): Router {
  const router = Router();

  // A past financial year, selected per request (`X-Financial-Year`), is read-only — docs/hld/09. Ahead of every module router.
  router.use(financialYearContext(containers.config.contract));

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
  router.use('/field-activity', containers.fieldActivity.buildRouter());

  router.use('/marketing', containers.marketing.buildRouter());
  router.use('/payroll', containers.payroll.buildRouter());
  router.use('/attendance', containers.attendance.buildRouter());
  router.use('/sales', containers.sales.buildRouter());

  return router;
}
