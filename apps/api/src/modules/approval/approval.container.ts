import type { Router } from 'express';
import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { logger } from '@/shared/logging/logger.js';
import { ApprovalKindRegistry } from './application/approvalKindRegistry.js';
import { BulkDecideApprovalUseCase } from './application/usecases/bulkDecideApproval.usecase.js';
import { DecideApprovalUseCase } from './application/usecases/decideApproval.usecase.js';
import { GetApprovalDetailUseCase } from './application/usecases/getApprovalDetail.usecase.js';
import { ListApprovalsUseCase } from './application/usecases/listApprovals.usecase.js';
import { GetApprovalForRecordUseCase } from './application/usecases/getApprovalForRecord.usecase.js';
import { ReopenApprovalUseCase } from './application/usecases/reopenApproval.usecase.js';
import { SubmitApprovalUseCase } from './application/usecases/submitApproval.usecase.js';
import { WithdrawApprovalUseCase } from './application/usecases/withdrawApproval.usecase.js';
import type { ConfigProviderPort } from './domain/configProvider.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoApprovalRequestAdapter } from './infrastructure/mongoApprovalRequest.adapter.js';
import { makeApprovalControllers } from './interface/approval.controller.js';
import { buildApprovalRouter } from './interface/approval.route.js';
import type { ApprovalPublicContract } from './approval.public.js';

/**
 * The action use cases are also exposed on the container (not the contract) for scripts and
 * live checks; other modules only ever get `contract`.
 */
export interface ApprovalContainer {
  contract: ApprovalPublicContract;
  buildRouter: () => Router;
  decide: DecideApprovalUseCase;
  withdraw: WithdrawApprovalUseCase;
  reopen: ReopenApprovalUseCase;
}

/** `users` and `config` are Identity's and Config's public contracts, passed in by the composition root. */
export function buildApprovalContainer(users: UserDirectoryPort, config: ConfigProviderPort): ApprovalContainer {
  // 1. Adapters
  const requestRepository = new MongoApprovalRequestAdapter();
  const transactions = new MongooseTransactionRunner();
  const kinds = new ApprovalKindRegistry();

  // 2. Use cases
  const submit = new SubmitApprovalUseCase(requestRepository, users, kinds, config);
  const decide = new DecideApprovalUseCase(requestRepository, users, kinds, transactions);
  const withdraw = new WithdrawApprovalUseCase(requestRepository, kinds, transactions);
  const reopen = new ReopenApprovalUseCase(requestRepository, kinds, transactions);
  const getForRecord = new GetApprovalForRecordUseCase(requestRepository);
  const list = new ListApprovalsUseCase(requestRepository, users, kinds, config);
  const detail = new GetApprovalDetailUseCase(requestRepository, users, kinds, config);
  // Logged like an unhandled request error (shared/http/error-handler.ts), so it still alerts.
  const bulk = new BulkDecideApprovalUseCase(decide, (requestId, err) =>
    logger.error(
      { requestId, err: String(err), stack: err instanceof Error ? err.stack : undefined },
      'bulk approval item failed',
    ),
  );

  return {
    contract: {
      registerKind: (definition) => kinds.register(definition),
      submit: (input, ctx) => submit.execute(input, ctx),
      getForRecord: (kind, recordId) => getForRecord.execute(kind, recordId),
    },
    buildRouter: () => buildApprovalRouter(makeApprovalControllers({ list, detail, decide, bulk, withdraw, reopen })),
    decide,
    withdraw,
    reopen,
  };
}
