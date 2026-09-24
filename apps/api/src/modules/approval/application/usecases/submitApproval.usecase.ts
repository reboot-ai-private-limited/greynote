import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import {
  isEditableBySubmitter,
  type ApprovalRequest,
  type ApprovalWorkflow,
} from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import { parseManagerOnlyKinds } from '../../domain/approvalRules.js';
import { MANAGER_ONLY_KINDS_KEY, type ConfigProviderPort } from '../../domain/configProvider.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';

export interface SubmitApprovalInput {
  kind: string;
  recordId: string;
  submitterId: string;
}

/**
 * Called by an owning module when its record is submitted — the first time, or again after a
 * rejection, withdrawal or Admin reopen (a new cycle on the same request, history kept).
 *
 * `ctx` lets the owning module create/update its record and submit in one transaction. No
 * `onStatusChange` callback fires here: the owning module started this, so it already knows.
 */
export class SubmitApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly kinds: ApprovalKindRegistry,
    private readonly config: ConfigProviderPort,
  ) {}

  async execute(input: SubmitApprovalInput, ctx?: TransactionContext): Promise<ApprovalRequest> {
    this.kinds.get(input.kind); // fail fast on an unregistered kind
    const submitter = await this.users.findUserSummary(input.submitterId);
    if (!submitter) throw AppError.badRequest('No such employee.', { field: 'submitterId' });

    const existing = await this.requests.findByRecord(input.kind, input.recordId);
    const workflow = await this.workflowFor(input.kind);
    const now = new Date();

    if (!existing) {
      return this.requests.create(
        {
          kind: input.kind,
          recordId: input.recordId,
          submitterId: input.submitterId,
          status: 'SUBMITTED',
          workflow,
          cycle: 1,
          submittedAt: now,
          decidedAt: null,
          history: [
            {
              action: 'SUBMIT',
              authority: 'SUBMITTER',
              actorId: submitter.id,
              actorRole: submitter.role,
              comment: null,
              at: now,
              resultingStatus: 'SUBMITTED',
              cycle: 1,
            },
          ],
        },
        ctx,
      );
    }

    if (existing.submitterId !== input.submitterId) {
      throw AppError.forbidden('Only the employee who submitted this can resubmit it.');
    }
    if (!isEditableBySubmitter(existing.status)) {
      throw AppError.conflict(
        existing.status === 'APPROVED'
          ? 'This is already approved. Ask Admin to reopen it.'
          : 'This is already waiting for approval.',
      );
    }

    const cycle = existing.cycle + 1;
    const updated = await this.requests.transition(
      existing.id,
      existing.status,
      {
        status: 'SUBMITTED',
        decidedAt: null,
        // Re-read, so a config change applies from the next cycle on — never mid-cycle.
        newCycle: { cycle, workflow, submittedAt: now },
        action: {
          action: 'RESUBMIT',
          authority: 'SUBMITTER',
          actorId: submitter.id,
          actorRole: submitter.role,
          comment: null,
          at: now,
          resultingStatus: 'SUBMITTED',
          cycle,
        },
      },
      ctx,
    );
    if (!updated) throw AppError.conflict('This request changed while you were resubmitting. Reload it.');
    return updated;
  }

  private async workflowFor(kind: string): Promise<ApprovalWorkflow> {
    const managerOnly = parseManagerOnlyKinds(await this.config.get(MANAGER_ONLY_KINDS_KEY));
    return managerOnly.has(kind.toUpperCase()) ? 'MANAGER_ONLY' : 'MANAGER_THEN_FINAL';
  }
}
