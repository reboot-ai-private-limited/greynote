import type { ApprovalStatusChange, ApprovalSubject } from '@/modules/approval/approval.public.js';
import type { TransactionContext } from '@/shared/db/transaction.port.js';
import { AppError } from '@/shared/errors/AppError.js';
import type { ChemistRepositoryPort } from '../domain/chemist.repository.port.js';
import type { TerritoryPort } from '../domain/territory.port.js';

export const NEW_CHEMIST_KIND = 'NEW_CHEMIST';

/** A new Chemist's name and the "HQ · Route" it was added on, for the rows of the approvals list. */
export function makeChemistDescriber(chemists: ChemistRepositoryPort, territory: TerritoryPort) {
  return async (recordIds: string[]): Promise<Map<string, ApprovalSubject>> => {
    const found = await Promise.all(
      recordIds.map(async (id) => {
        const chemist = await chemists.findById(id);
        if (!chemist) return null;
        const route = await territory.getRoute(chemist.routeId);
        return [id, { title: chemist.name, subtitle: route ? `${route.hqName} · ${route.name}` : null }] as const;
      }),
    );
    return new Map(found.filter((e) => e !== null));
  };
}

/**
 * The `NEW_CHEMIST` kind's `onStatusChange`, run inside the approval module's transaction (if it throws, the decision rolls back too):
 *
 * - `APPROVED` — the Chemist becomes `active` and can be called on, ordered for and planned.
 * - `REOPENED` (Admin reopens an approved one) — back to `pending`, so nobody acts on it while it is reconsidered.
 * - Rejected or withdrawn — nothing to do; it stays `pending`.
 */
export function makeChemistApprovalHandler(chemists: ChemistRepositoryPort) {
  return async (change: ApprovalStatusChange, ctx: TransactionContext): Promise<void> => {
    if (change.status !== 'APPROVED' && change.status !== 'REOPENED') return;
    const chemist = await chemists.findById(change.recordId);
    if (!chemist) throw AppError.internal('INTERNAL', { reason: 'CHEMIST_NOT_FOUND', recordId: change.recordId });
    if (change.status === 'REOPENED') {
      await chemists.update(chemist.id, { status: 'pending', approvedAt: null }, ctx);
      return;
    }
    await chemists.update(chemist.id, { status: 'active', approvedAt: new Date() }, ctx);
  };
}
