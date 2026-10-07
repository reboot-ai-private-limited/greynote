import type { ApprovalsPort } from '../../domain/approvals.port.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { ChemistCallRepositoryPort, DoctorCallRepositoryPort, FollowupRepositoryPort } from '../../domain/records.repository.port.js';
import type { DcrClock } from '../dcrClock.js';
import { DCR_KIND, dcrStatus, isQualifyingDcr } from '../dcrStatus.js';

/** What one employee's reported days of one month came to. A day is reported once its DCR is submitted or approved (`hasQualifyingDcr`'s rule). */
export interface DcrMonthSummary {
  userId: string;
  /** `YYYY-MM`, by the day reported. */
  month: string;
  reportedDays: number;
  /** Reported days submitted after the day itself (in the business timezone). */
  lateDays: number;
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  /** Doctor and chemist calls together, by the server's geofence result. */
  geofence: { pass: number; fail: number; unverified: number; override: number };
}

/**
 * Every employee's reported days, calls, follow-ups, geofence results and late submissions by month over a date range — the DCR report's input,
 * in a handful of queries however many reports. Only reported days count: calls logged in a draft or rejected report are left out.
 */
export class SummarizeDcrsUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly doctorCalls: DoctorCallRepositoryPort,
    private readonly chemistCalls: ChemistCallRepositoryPort,
    private readonly followups: FollowupRepositoryPort,
    private readonly clock: DcrClock,
  ) {}

  async execute(range: { from: string; to: string }): Promise<DcrMonthSummary[]> {
    const all = await this.dcrs.listRange(range.from, range.to);
    const requests = new Map((await this.approvals.listForRecords(DCR_KIND, all.map((d) => d.id))).map((r) => [r.recordId, r]));
    const reported = all.filter((d) => isQualifyingDcr(dcrStatus(requests.get(d.id) ?? null)));
    const byDcr = new Map(reported.map((d) => [d.id, d]));
    const [doctor, chemist, follow] = await Promise.all([this.doctorCalls.countByGeofence(range), this.chemistCalls.countByGeofence(range), this.followups.countByDcrRange(range)]);

    const out = new Map<string, DcrMonthSummary>();
    const of = (userId: string, month: string): DcrMonthSummary => {
      const key = `${userId}|${month}`;
      const cur = out.get(key) ?? { userId, month, reportedDays: 0, lateDays: 0, doctorCalls: 0, chemistCalls: 0, followups: 0, geofence: { pass: 0, fail: 0, unverified: 0, override: 0 } };
      out.set(key, cur);
      return cur;
    };
    for (const d of reported) {
      const s = of(d.userId, d.reportDate.slice(0, 7));
      s.reportedDays += 1;
      const submitted = requests.get(d.id)?.submittedAt;
      if (submitted && (await this.clock.dateOf(submitted)) > d.reportDate) s.lateDays += 1;
    }
    const geofenceKey = { PASS: 'pass', FAIL: 'fail', UNVERIFIED: 'unverified', OVERRIDE: 'override' } as const;
    for (const [rows, kind] of [[doctor, 'doctorCalls'], [chemist, 'chemistCalls']] as const) {
      for (const r of rows) {
        const d = byDcr.get(r.dcrId);
        if (!d) continue;
        const s = of(d.userId, d.reportDate.slice(0, 7));
        s[kind] += r.count;
        s.geofence[geofenceKey[r.status]] += r.count;
      }
    }
    for (const r of follow) {
      const d = byDcr.get(r.dcrId);
      if (d) of(d.userId, d.reportDate.slice(0, 7)).followups += r.count;
    }
    return [...out.values()];
  }
}

/** The Doctors an employee called on in their reported days of a range (both ends inclusive): the coverage report's input. */
export class ListCalledDoctorsUseCase {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly approvals: ApprovalsPort,
    private readonly doctorCalls: DoctorCallRepositoryPort,
  ) {}

  async execute(userId: string, range: { from: string; to: string }): Promise<string[]> {
    const mine = await this.dcrs.listForUsers([userId], range.from, range.to);
    const requests = new Map((await this.approvals.listForRecords(DCR_KIND, mine.map((d) => d.id))).map((r) => [r.recordId, r]));
    const reported = mine.filter((d) => isQualifyingDcr(dcrStatus(requests.get(d.id) ?? null))).map((d) => d.id);
    return this.doctorCalls.distinctDoctorIds(reported);
  }
}
