import { AppError } from '@/shared/errors/AppError.js';
import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import type { ApprovalKindRegistry } from '../approvalKindRegistry.js';

export interface SubmitApprovalInput {
  kind: string;
  recordId: string;
  submitterId: string;
}

/**
 * Called by an owning module when its record is submitted. Starts at `SUBMITTED` for everyone —
 * a top-of-chain submitter included, whose request the final approvers then pick up directly.
 */
export class SubmitApprovalUseCase {
  constructor(
    private readonly requests: ApprovalRequestRepositoryPort,
    private readonly users: UserDirectoryPort,
    private readonly kinds: ApprovalKindRegistry,
  ) {}

  async execute(input: SubmitApprovalInput): Promise<ApprovalRequest> {
    const kind = this.kinds.get(input.kind);
    const submitter = await this.users.findUserSummary(input.submitterId);
    if (!submitter) throw AppError.badRequest('No such employee.', { field: 'submitterId' });

    if (await this.requests.findByRecord(input.kind, input.recordId)) {
      throw AppError.conflict('This has already been submitted for approval.');
    }

    const now = new Date();
    return this.requests.create({
      kind: input.kind,
      recordId: input.recordId,
      submitterId: input.submitterId,
      status: 'SUBMITTED',
      workflow: kind.defaultWorkflow,
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
        },
      ],
    });
  }
}
