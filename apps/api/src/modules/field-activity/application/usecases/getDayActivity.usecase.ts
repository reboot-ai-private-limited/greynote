import type { DoctorCall } from '../../domain/call.entity.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { FieldMasterDataPort } from '../../domain/fieldMasterData.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { DcrStatus } from '../dcrStatus.js';
import type { DcrViews } from '../dcrViews.js';

/** What one person did on one day, for a manager's board: the report's status and each call with its time. */
export interface DayActivity {
  userId: string;
  /** The report's date (`YYYY-MM-DD`). */
  date: string;
  /** `null` when nothing was logged and no report exists for the day. */
  reportStatus: DcrStatus | null;
  doctorCalls: Array<{ doctorId: string; recordedAt: Date; remarks: string | null; geofence: string; /** Too soon after this visit: shown, not counted. */ extraVisitAfter?: string | null; samples: Array<{ productName: string; quantity: number }>; lbl: string[] }>;
  chemistCalls: Array<{ chemistId: string; recordedAt: Date }>;
  followups: number;
}

/**
 * One day of several people at once (the team board): their reports of that date and, for each, the doctor calls (who, when, remarks, the
 * location check), the chemist calls and the number of follow-ups. A few queries per person who has a report; a person with none is empty.
 */
export class GetDayActivityUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly views: DcrViews,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    /** Names the products of the samples and LBL a call gave. */
    private readonly master?: Pick<FieldMasterDataPort, 'getProduct'>,
  ) {}

  private async callView(c: DoctorCall): Promise<DayActivity['doctorCalls'][number]> {
    const name = async (id: string) => (await this.master?.getProduct(id))?.name ?? 'Product';
    return {
      doctorId: c.doctorId,
      recordedAt: c.recordedAt,
      remarks: c.remarks,
      geofence: c.geofence.status,
      extraVisitAfter: c.extraVisitAfter ?? null,
      samples: await Promise.all(c.samples.map(async (s) => ({ productName: await name(s.productId), quantity: s.quantity }))),
      lbl: await Promise.all((c.lbl ?? []).map((l) => name(l.productId))),
    };
  }

  async execute(userIds: string[], date: string): Promise<DayActivity[]> {
    if (userIds.length === 0) return [];
    const views = await this.views.many(await this.dcrs.listForUsers(userIds, date, date));
    const byUser = new Map(views.map((v) => [v.userId, v]));
    return Promise.all(
      userIds.map(async (userId): Promise<DayActivity> => {
        const dcr = byUser.get(userId);
        if (!dcr) return { userId, date, reportStatus: null, doctorCalls: [], chemistCalls: [], followups: 0 };
        const [dc, cc, fu] = await Promise.all([this.doctorCalls.listForDcr(dcr.id), this.chemistCalls.listForDcr(dcr.id), this.followups.listForDcr(dcr.id)]);
        return {
          userId,
          date,
          reportStatus: dcr.status,
          doctorCalls: await Promise.all(dc.map((c) => this.callView(c))),
          chemistCalls: cc.map((c) => ({ chemistId: c.chemistId, recordedAt: c.recordedAt })),
          followups: fu.length,
        };
      }),
    );
  }

  /** One person's days of a range (both ends inclusive): the same lines, one per report that exists. */
  async range(userId: string, range: { from: string; to: string }): Promise<DayActivity[]> {
    const views = await this.views.many(await this.dcrs.listForUsers([userId], range.from, range.to));
    return Promise.all(
      views.map(async (dcr): Promise<DayActivity> => {
        const [dc, cc, fu] = await Promise.all([this.doctorCalls.listForDcr(dcr.id), this.chemistCalls.listForDcr(dcr.id), this.followups.listForDcr(dcr.id)]);
        return {
          userId,
          date: dcr.reportDate,
          reportStatus: dcr.status,
          doctorCalls: await Promise.all(dc.map((c) => this.callView(c))),
          chemistCalls: cc.map((c) => ({ chemistId: c.chemistId, recordedAt: c.recordedAt })),
          followups: fu.length,
        };
      }),
    );
  }
}
