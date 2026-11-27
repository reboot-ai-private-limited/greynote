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

/** The days in a range (both ends inclusive) the user reported — `HasQualifyingDcr` for a whole calendar in two queries (2026-11-27: really two). Sorted. */
export class ListReportedDatesUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
  ) {}

  /** `execute` for many people at once (2026-11-27): their DCRs in one query, the approvals in one more. */
  async many(userIds: string[], from: string, to: string): Promise<Array<{ userId: string; dates: string[] }>> {
    const dcrs = userIds.length > 0 ? await this.dcrs.listForUsers(userIds, from, to) : [];
    const requests = new Map((dcrs.length > 0 ? await this.approvals.listForRecords(DCR_KIND, dcrs.map((d) => d.id)) : []).map((r) => [r.recordId, r]));
    return userIds.map((userId) => ({
      userId,
      dates: [...new Set(dcrs.filter((d) => d.userId === userId && isQualifyingDcr(dcrStatus(requests.get(d.id) ?? null))).map((d) => d.reportDate))].sort(),
    }));
  }

  async execute(userId: string, from: string, to: string): Promise<string[]> {
    const dates: string[] = [];
    const dcrs = await this.dcrs.listForUsers([userId], from, to);
    const requests = new Map((dcrs.length > 0 ? await this.approvals.listForRecords(DCR_KIND, dcrs.map((d) => d.id)) : []).map((r) => [r.recordId, r]));
    for (const dcr of dcrs) {
      if (isQualifyingDcr(dcrStatus(requests.get(dcr.id) ?? null))) dates.push(dcr.reportDate);
    }
    return [...new Set(dates)].sort();
  }
}
