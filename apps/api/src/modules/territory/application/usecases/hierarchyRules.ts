import { AppError } from '@/shared/errors/AppError.js';
import type { TerritoryStatus } from '../../domain/territoryStatus.js';

/**
 * The rules every Territory level shares (decision-log 2026-09-24): names unique within the
 * parent ignoring case, nothing created or reactivated under an inactive parent, and nothing
 * deactivated while it still has active children.
 */

/** A new or reactivated node needs an existing, active parent. */
export function assertParentUsable(
  parent: { status: TerritoryStatus } | null,
  field: string,
  noun: string,
): void {
  if (!parent) throw AppError.badRequest(`No such ${noun}.`, { field });
  if (parent.status !== 'active') {
    throw AppError.conflict(`That ${noun} is inactive. Reactivate it first.`, { field });
  }
}

/** `sameName` is whatever the repository found under this name in the same parent. */
export function assertNameFree(sameName: { id: string } | null, noun: string, selfId?: string): void {
  if (sameName && sameName.id !== selfId) {
    throw AppError.conflict(`A ${noun} with that name already exists here.`, { field: 'name' });
  }
}

export function assertNoActiveChildren(activeChildren: number, noun: string, childNoun: string): void {
  if (activeChildren > 0) {
    throw AppError.conflict(`Deactivate this ${noun}'s ${childNoun} first.`, { activeChildren });
  }
}
