import type { UserListStatus } from '@greynote/contracts';
import { STATUS_LABEL } from './user';

export interface StatusCounts {
  active: number;
  pending: number;
  inactive: number;
  /** Blocked by the compliance rules: they can still sign in, but cannot submit. */
  blocked: number;
}

export interface StatusChip {
  /** The `status` filter value; empty for "All". */
  value: UserListStatus | '';
  label: string;
  count: number;
}

/** "All 20 · Active 14 · Onboarding 5 · Inactive 1": a click filters the list, so the dropdown is not needed. */
export function statusChips(c: Pick<StatusCounts, 'active' | 'pending' | 'inactive'>): StatusChip[] {
  return [
    { value: '', label: 'All', count: c.active + c.pending + c.inactive },
    { value: 'active', label: STATUS_LABEL.active, count: c.active },
    { value: 'pending', label: STATUS_LABEL.pending, count: c.pending },
    { value: 'inactive', label: STATUS_LABEL.inactive, count: c.inactive },
  ];
}

export interface AttentionItem {
  key: 'pending' | 'blocked';
  text: string;
  /** The filter that shows them. */
  filter: { status?: UserListStatus; blocked?: '1' };
}

/** What needs HR's eyes: people still being onboarded, and people blocked from submitting. Nothing to show means nothing is listed. */
export function attentionItems(c: StatusCounts): AttentionItem[] {
  const out: AttentionItem[] = [];
  if (c.pending > 0) out.push({ key: 'pending', text: `${c.pending} ${c.pending === 1 ? 'is' : 'are'} still being onboarded`, filter: { status: 'pending' } });
  if (c.blocked > 0) out.push({ key: 'blocked', text: `${c.blocked} ${c.blocked === 1 ? 'is' : 'are'} blocked from submitting`, filter: { blocked: '1' } });
  return out;
}
