import type { WorkingType } from '@greynote/contracts';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import type { ApprovalStatus } from '@/modules/approval/approval.public.js';
import type { DcrRepositoryPort } from '../../domain/dcr.repository.port.js';
import type { PlanningPort } from '../../domain/planning.port.js';
import type { ExpenseRepositoryPort } from '../../domain/records.repository.port.js';
import type { TerritoryPort } from '../../domain/territory.port.js';
import type { UserDirectoryPort } from '../../domain/userDirectory.port.js';
import { calculateTaDa } from '../taDaCalculator.js';

/** Past the manager: the claim is accepted, so TA/DA exists. */
const APPROVED_STATUSES: ReadonlySet<ApprovalStatus> = new Set(['MANAGER_APPROVED', 'APPROVED']);
/** Back out of approval: an unpaid computed claim no longer counts. */
const WITHDRAWN_STATUSES: ReadonlySet<ApprovalStatus> = new Set(['REJECTED', 'REOPENED', 'WITHDRAWN']);

/**
 * TA/DA over a DCR's life (LLD field-activity.md, *When TA/DA is generated*), run from the approval module's
 * status-change hook, inside its transaction:
 *
 * - Once the DCR is past the manager (`MANAGER_APPROVED`, or `APPROVED` for a submitter with no manager or an
 *   Admin override), the server computes the `AUTO` rows from the day's Plan, the Routes and the Pay Band — never
 *   from anything the phone sent — and writes them `UNPAID`. Only if the DCR has no live `AUTO` rows yet, so a
 *   second hook for the same approval, or `MANAGER_APPROVED → APPROVED`, adds nothing.
 * - If it goes back (Admin's final rejection, a reopen, a withdrawal), its `UNPAID` `AUTO` rows are `CANCELLED`;
 *   a `PAID` one is left. A later approval after a resubmission generates fresh rows.
 * - `MANUAL` expenses are never touched here.
 */
export class TaDaLifecycle {
  constructor(
    private readonly dcrs: DcrRepositoryPort,
    private readonly planning: PlanningPort,
    private readonly territory: TerritoryPort,
    private readonly users: UserDirectoryPort,
    private readonly expenses: ExpenseRepositoryPort,
  ) {}

  async onStatusChange(dcrId: string, status: ApprovalStatus, ctx: TransactionContext, now: Date = new Date()): Promise<void> {
    if (WITHDRAWN_STATUSES.has(status)) {
      await this.expenses.cancelUnpaidAuto(dcrId, ctx);
      return;
    }
    if (APPROVED_STATUSES.has(status)) await this.generate(dcrId, ctx, now);
  }

  private async generate(dcrId: string, ctx: TransactionContext, now: Date): Promise<void> {
    const dcr = await this.dcrs.findById(dcrId);
    if (!dcr) return;
    if (await this.expenses.hasActiveAuto(dcrId, ctx)) return;
    // No Plan for the day, nothing to compute from: a gap for the Accountant's audit, not a number to invent.
    const day = await this.planning.getDailyPlanDay(dcr.userId, dcr.reportDate);
    if (!day) return;
    const routes = day.workingType === 'FIELD_WORK' ? await Promise.all(day.routeIds.map((id) => this.territory.getRoute(id))) : [];
    const rows = calculateTaDa(day.workingType as WorkingType, routes, day.routeIds, await this.users.getPayBandRates(dcr.userId));
    for (const row of rows) {
      await this.expenses.create(
        { dcrId, userId: dcr.userId, reportDate: dcr.reportDate, routeId: row.routeId, type: row.type, source: 'AUTO', amountPaise: row.amountPaise, remarks: null, paymentStatus: 'UNPAID', distanceFlag: row.distanceFlag, paidBy: null, paidAt: null, clientId: null, recordedAt: now },
        ctx,
      );
    }
  }
}
