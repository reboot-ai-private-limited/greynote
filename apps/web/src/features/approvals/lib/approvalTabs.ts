import type { RoleName } from '@greynote/contracts';
import { KIND_OPTIONS } from './approvals';

export interface ApprovalTab {
  /** The kind it shows. */
  value: string;
  label: string;
}

/** The order of the tabs: the daily work first (it is the most, and the default), then the monthly, then the occasional. */
const TAB_ORDER = ['DAILY_PLAN', 'DCR', 'MONTHLY_PLAN', 'EXPENSE_MONTH', 'SECONDARY_SALES', 'LEAVE', 'NEW_DOCTOR', 'DOCTOR_SERVICE'];
/** What HR decides: leave, and (like Admin) the plans. */
const HR_KINDS = ['DAILY_PLAN', 'MONTHLY_PLAN', 'LEAVE'];
const rank = (kind: string): number => {
  const i = TAB_ORDER.indexOf(kind);
  return i === -1 ? TAB_ORDER.length : i;
};

/**
 * The tabs of the Approvals screen: one per kind, Daily plan first. There is no "All": mixed, the daily kinds would bury the rest, and
 * each tab's count shows where work is waiting. HR decides leave and plans only (the API would return an empty list for the rest),
 * so HR gets just those tabs.
 */
export function approvalTabsFor(role: RoleName | undefined): readonly ApprovalTab[] {
  const kinds = role === 'HR' ? KIND_OPTIONS.filter((k) => HR_KINDS.includes(k.value)) : KIND_OPTIONS;
  return [...kinds].sort((a, b) => rank(a.value) - rank(b.value));
}

/** The tab in force: the one the URL names if it is a tab, else the first. `''` when there are no tabs. */
export function activeTab(tabs: readonly ApprovalTab[], kind: string): string {
  return tabs.find((t) => t.value === kind)?.value ?? tabs[0]?.value ?? '';
}

/** "Leave · 3": the count of what is waiting, left off while it loads. */
export function tabCaption(label: string, waiting: number | undefined): string {
  return waiting === undefined ? label : `${label} · ${waiting}`;
}
