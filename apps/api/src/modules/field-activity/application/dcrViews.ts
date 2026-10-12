import type { Dcr } from '../domain/dcr.entity.js';
import type { ApprovalsPort } from '../domain/approvals.port.js';
import { DCR_KIND, dcrStatus, type DcrStatus } from './dcrStatus.js';

export interface DcrView {
  id: string;
  userId: string;
  reportDate: string;
  status: DcrStatus;
  /** The employee's note on the day, set at submit. */
  remarks: string | null;
  /** For `/api/approvals/:id` — the history, and the `cycle` a decision must name. */
  approval: { requestId: string; cycle: number; submittedAt: Date; decidedAt: Date | null } | null;
}

/** A DCR with its approval state attached. */
export class DcrViews {
  constructor(private readonly approvals: ApprovalsPort) {}

  async many(dcrs: Dcr[]): Promise<DcrView[]> {
    return Promise.all(
      dcrs.map(async (d) => {
        const request = await this.approvals.getForRecord(DCR_KIND, d.id);
        return {
          id: d.id,
          userId: d.userId,
          reportDate: d.reportDate,
          status: dcrStatus(request),
          remarks: d.remarks,
          approval: request && { requestId: request.id, cycle: request.cycle, submittedAt: request.submittedAt, decidedAt: request.decidedAt },
        };
      }),
    );
  }

  async one(dcr: Dcr): Promise<DcrView> {
    return (await this.many([dcr]))[0]!;
  }
}
