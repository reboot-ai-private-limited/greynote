import type { RoleName } from '@greynote/contracts';
import { KIND_OPTIONS } from './approvals';

export interface ApprovalTab {
  /** The kind it shows; empty for the tab with everything. */
  value: string;
  label: string;
}

/**
 * The tabs of the Approvals screen: everything, then one per kind. HR decides leave only (the API would only ever return an empty list
 * for the rest), so HR has no tabs at all.
 */
export function approvalTabsFor(role: RoleName | undefined): readonly ApprovalTab[] {
  if (role === 'HR') return [];
  return [{ value: '', label: 'All' }, ...KIND_OPTIONS];
}

/** "Leave · 3": the count of what is waiting, left off while it loads. */
export function tabCaption(label: string, waiting: number | undefined): string {
  return waiting === undefined ? label : `${label} · ${waiting}`;
}
