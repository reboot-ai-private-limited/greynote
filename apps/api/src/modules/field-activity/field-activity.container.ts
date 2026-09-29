import type { Router } from 'express';
import type { ConfigReader } from '@/shared/config/readConfig.js';
import type { SyncPublicContract } from '@/modules/sync/sync.public.js';
import { DcrClock } from './application/dcrClock.js';
import { makeDcrSubmitSyncHandler } from './application/dcrSubmitSync.js';
import { DCR_KIND } from './application/dcrStatus.js';
import { DcrViews } from './application/dcrViews.js';
import { HasQualifyingDcrUseCase } from './application/usecases/hasQualifyingDcr.usecase.js';
import { LoggingGate } from './application/loggingGate.js';
import { GetDcrUseCase, ListAllDcrsUseCase, ListMyDcrsUseCase, ListTeamDcrsUseCase } from './application/usecases/readDcrs.usecase.js';
import { SubmitDcrUseCase } from './application/usecases/submitDcr.usecase.js';
import type { ApprovalsPort } from './domain/approvals.port.js';
import type { PlanningPort } from './domain/planning.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import type { FieldActivityPublicContract } from './field-activity.public.js';
import { MongoDcrAdapter } from './infrastructure/mongoDcr.adapter.js';
import { makeFieldActivityControllers } from './interface/field-activity.controller.js';
import { buildFieldActivityRouter } from './interface/field-activity.route.js';
import { dcrSubmitPayloadSchema } from './interface/field-activity.schemas.js';

export interface FieldActivityContainer {
  contract: FieldActivityPublicContract;
  buildRouter: () => Router;
}

/**
 * Tier 4. Built up over Phase 6 (docs/roadmap.md): the DCR and its gate (here), calls and follow-ups,
 * expenses, the rest of the sync record kinds, DCR review, TA/DA, Doctor Service and Gift, mark-paid, and the
 * missed-DCR job. Records reach the server through the sync push (LLD sync.md), so this module registers
 * handlers there rather than exposing a POST per record.
 *
 * Identity's, Planning's, Approval's, Sync's and Config's public contracts, passed in by the composition root.
 */
export function buildFieldActivityContainer(
  users: UserDirectoryPort,
  planning: PlanningPort,
  approvals: ApprovalsPort,
  sync: SyncPublicContract,
  config: ConfigReader,
): FieldActivityContainer {
  // 1. Adapters
  const dcrs = new MongoDcrAdapter();

  // A DCR goes manager, then Admin (client F1); TA/DA generation and its cancellation hook in here in later steps.
  approvals.registerKind({ kind: DCR_KIND, finalApproverRoles: ['ADMIN'] });

  // 2. Use cases
  const clock = new DcrClock(config);
  const gate = new LoggingGate(users, planning, approvals, dcrs, clock);
  const views = new DcrViews(approvals);
  const submitDcr = new SubmitDcrUseCase(gate, dcrs, approvals);
  const hasQualifyingDcr = new HasQualifyingDcrUseCase(dcrs, approvals);
  sync.registerHandler(makeDcrSubmitSyncHandler(submitDcr, (payload) => dcrSubmitPayloadSchema.parse(payload)));

  return {
    contract: {
      hasQualifyingDcr: (userId, date) => hasQualifyingDcr.execute(userId, date),
    },
    buildRouter: () =>
      buildFieldActivityRouter(
        makeFieldActivityControllers({
          listMine: new ListMyDcrsUseCase(dcrs, views),
          listAll: new ListAllDcrsUseCase(dcrs, users, views),
          listTeam: new ListTeamDcrsUseCase(dcrs, users, views),
          get: new GetDcrUseCase(dcrs, users, views),
        }),
      ),
  };
}
