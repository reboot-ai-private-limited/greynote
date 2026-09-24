import type { ApprovalRequest } from '../../domain/approvalRequest.entity.js';
import type { ApprovalRequestRepositoryPort } from '../../domain/approvalRequest.repository.port.js';

/** Contract read for owning modules: the request behind one of their records, or null. */
export class GetApprovalForRecordUseCase {
  constructor(private readonly requests: ApprovalRequestRepositoryPort) {}

  execute(kind: string, recordId: string): Promise<ApprovalRequest | null> {
    return this.requests.findByRecord(kind, recordId);
  }
}
