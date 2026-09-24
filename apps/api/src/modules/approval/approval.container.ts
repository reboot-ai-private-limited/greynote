import { MongooseTransactionRunner } from '@/shared/db/mongooseTransactionRunner.js';
import { ApprovalKindRegistry } from './application/approvalKindRegistry.js';
import { DecideApprovalUseCase } from './application/usecases/decideApproval.usecase.js';
import { GetApprovalForRecordUseCase } from './application/usecases/getApprovalForRecord.usecase.js';
import { ReopenApprovalUseCase } from './application/usecases/reopenApproval.usecase.js';
import { SubmitApprovalUseCase } from './application/usecases/submitApproval.usecase.js';
import { WithdrawApprovalUseCase } from './application/usecases/withdrawApproval.usecase.js';
import type { ConfigProviderPort } from './domain/configProvider.port.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoApprovalRequestAdapter } from './infrastructure/mongoApprovalRequest.adapter.js';
import type { ApprovalPublicContract } from './approval.public.js';

/**
 * No HTTP surface yet — the approval screens' routes land in Phase 3 step 4. The action use cases
 * are exposed on the container (not the contract) so they, and the live checks, can drive them.
 */
export interface ApprovalContainer {
  contract: ApprovalPublicContract;
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

  return {
    contract: {
      registerKind: (definition) => kinds.register(definition),
      submit: (input, ctx) => submit.execute(input, ctx),
      getForRecord: (kind, recordId) => getForRecord.execute(kind, recordId),
    },
    decide,
    withdraw,
    reopen,
  };
}
