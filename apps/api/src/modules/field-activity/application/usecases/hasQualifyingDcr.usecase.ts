import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import { DCR_KIND, dcrStatus, isQualifyingDcr } from '../dcrStatus.js';

/** Did this user report this day? — the missed-DCR job's question, answered through the contract. */
export class HasQualifyingDcrUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  async execute(userId: string, date: string): Promise<boolean> {
    const dcr = await this.dcrs.findByUserAndDate(userId, date);
    return dcr !== null && isQualifyingDcr(dcrStatus(await this.approvals.getForRecord(DCR_KIND, dcr.id)));
  }
}
