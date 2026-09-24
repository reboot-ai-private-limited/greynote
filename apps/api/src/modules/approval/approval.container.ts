import { ApprovalKindRegistry } from './application/approvalKindRegistry.js';
import { DecideApprovalUseCase } from './application/usecases/decideApproval.usecase.js';
import { GetApprovalForRecordUseCase } from './application/usecases/getApprovalForRecord.usecase.js';
import { SubmitApprovalUseCase } from './application/usecases/submitApproval.usecase.js';
import type { UserDirectoryPort } from './domain/userDirectory.port.js';
import { MongoApprovalRequestAdapter } from './infrastructure/mongoApprovalRequest.adapter.js';
import type { ApprovalPublicContract } from './approval.public.js';

/**
 * No HTTP surface yet — the approval screens' routes land in Phase 3 step 4. `decide` is exposed
 * on the container (not the contract) so they, and the live checks, can drive decisions.
 */
export interface ApprovalContainer {
  contract: ApprovalPublicContract;
  decide: DecideApprovalUseCase;
}

/** `users` is Identity's public contract, passed in by the top-level composition root. */
export function buildApprovalContainer(users: UserDirectoryPort): ApprovalContainer {
  // 1. Adapters
  const requestRepository = new MongoApprovalRequestAdapter();
  const kinds = new ApprovalKindRegistry();

  // 2. Use cases
  const submit = new SubmitApprovalUseCase(requestRepository, users, kinds);
  const decide = new DecideApprovalUseCase(requestRepository, users, kinds);
  const getForRecord = new GetApprovalForRecordUseCase(requestRepository);

  return {
    contract: {
      registerKind: (definition) => kinds.register(definition),
      submit: (input) => submit.execute(input),
      getForRecord: (kind, recordId) => getForRecord.execute(kind, recordId),
    },
    decide,
  };
}
