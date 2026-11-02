import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import { BulkGrantLateUseCase } from './application/usecases/bulkGrantLate.usecase.js';
import { ListEligibleUseCase } from './application/usecases/listEligible.usecase.js';
import { GrantLateUseCase } from './application/usecases/grantLate.usecase.js';
import { ListLateUseCase } from './application/usecases/listLate.usecase.js';
import { PreviewLateUseCase } from './application/usecases/previewLate.usecase.js';
import { RevokeLateUseCase } from './application/usecases/revokeLate.usecase.js';
import { LateGrantGate } from './application/lateGrantGate.js';
import { PeriodLocks } from './application/periodLocks.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoLateGrantAdapter } from './infrastructure/mongoLateGrant.adapter.js';
import { makeLateGrantsControllers } from './interface/lateGrants.controller.js';
import { buildLateGrantsRouter } from './interface/lateGrants.route.js';
import type { LateGrantsPublicContract } from './lateGrants.public.js';

export interface LateGrantsContainer {
  contract: LateGrantsPublicContract;
  buildRouter(): Router;
}

/** Identity's and Config's public contracts, passed in by the composition root. Sits below Planning so its deadlines can spend a grant. */
export function buildLateGrantsContainer(users: UserDirectoryPort, config: ConfigReader, now: () => Date = () => new Date()): LateGrantsContainer {
  const grants = new MongoLateGrantAdapter();
  const locks = new PeriodLocks();
  const gate = new LateGrantGate(grants, locks, now);
  const grant = new GrantLateUseCase(grants, users, locks, config, now);
  const useCases = {
    grant,
    bulk: new BulkGrantLateUseCase(grant),
    eligible: new ListEligibleUseCase(users),
    revoke: new RevokeLateUseCase(grants, now),
    list: new ListLateUseCase(grants, users, now),
    preview: new PreviewLateUseCase(locks),
  };
  return {
    contract: { gate, grants, locks, addLockGuard: (guard) => locks.bind(guard) },
    buildRouter: () => buildLateGrantsRouter(makeLateGrantsControllers(useCases)),
  };
}
