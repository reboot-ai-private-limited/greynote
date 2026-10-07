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

/** The days in a range (both ends inclusive) the user reported — `HasQualifyingDcr` for a whole calendar in two queries. Sorted. */
export class ListReportedDatesUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  async execute(userId: string, from: string, to: string): Promise<string[]> {
    const dates: string[] = [];
    for (const dcr of await this.dcrs.listForUsers([userId], from, to)) {
      if (isQualifyingDcr(dcrStatus(await this.approvals.getForRecord(DCR_KIND, dcr.id)))) dates.push(dcr.reportDate);
    }
    return [...new Set(dates)].sort();
  }
}
