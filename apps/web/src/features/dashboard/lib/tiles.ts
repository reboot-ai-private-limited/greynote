import type {
  ApprovalInboxItemDto,
  ExpenseAuditRowDto,
  LeaveRequestDto,
  MissingStockRowDto,
  PaginatedDto,
  PayrollRunDto,
  PendingDeviceDto,
} from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { ageLabel } from '@/lib/dates';
import { capLabel, longestWaiting, sumPaise } from '@/lib/dashboard';
import { formatMoney } from '@/lib/format';

/** What a tile shows. Mappers are pure so the rules ("500+", "All clear") are testable in Node. */
export interface TileData {
  value: string;
  note?: string | undefined;
  tone?: BadgeTone | undefined;
}

/** The expenses endpoint is capped; at the cap the true count and total are unknown. */
export const EXPENSE_CAP = 500;

const ALL_CLEAR: Pick<TileData, 'note' | 'tone'> = { note: 'All clear', tone: 'success' };

export function approvalsTile(page: PaginatedDto<ApprovalInboxItemDto>, now = new Date()): TileData {
  if (page.total === 0) return { value: '0', ...ALL_CLEAR };
  const oldest = longestWaiting(page.items, (i) => i.submittedAt, 1)[0];
  return {
    value: String(page.total),
    note: oldest ? `Oldest waiting ${ageLabel(oldest.submittedAt, now)}` : undefined,
    tone: 'warning',
  };
}

export function devicesTile(rows: readonly PendingDeviceDto[]): TileData {
  return rows.length === 0
    ? { value: '0', ...ALL_CLEAR }
    : { value: String(rows.length), note: 'Waiting on you', tone: 'warning' };
}

export function employeesTile(counts: { active: number; pending: number }): TileData {
  return {
    value: String(counts.active),
    note: counts.pending > 0 ? `${counts.pending} onboarding` : undefined,
    tone: counts.pending > 0 ? 'accent' : undefined,
  };
}

export function missingStockTile(rows: readonly MissingStockRowDto[]): TileData {
  if (rows.length === 0) return { value: '0', ...ALL_CLEAR };
  const outlets = rows.reduce((n, r) => n + r.outlets.length, 0);
  return { value: String(rows.length), note: `${outlets} outlets not reported`, tone: 'warning' };
}

export function onLeaveTile(page: PaginatedDto<LeaveRequestDto>): TileData {
  const onLeave = page.items.filter((l) => l.status === 'APPROVED').length;
  return { value: String(onLeave), note: onLeave === 0 ? 'Everyone is in' : 'on approved leave today' };
}

export function unpaidExpensesTile(rows: readonly ExpenseAuditRowDto[]): TileData {
  if (rows.length === 0) return { value: formatMoney(0), ...ALL_CLEAR };
  if (rows.length >= EXPENSE_CAP) {
    // Capped and unpaid-first: the sum would be an undercount, so do not show one.
    return {
      value: `${capLabel(rows.length, EXPENSE_CAP)} claims`,
      note: 'Total unavailable — narrow the range',
      tone: 'warning',
    };
  }
  return { value: formatMoney(sumPaise(rows)), note: `${rows.length} claims awaiting payment`, tone: 'warning' };
}

export function payrollTile(rows: readonly PayrollRunDto[]): TileData {
  if (rows.length === 0) return { value: 'Not generated', note: 'No runs for this month', tone: 'warning' };
  const drafts = rows.filter((r) => r.status === 'DRAFT').length;
  return drafts > 0
    ? { value: 'Draft', note: `${drafts} of ${rows.length} awaiting finalize`, tone: 'warning' }
    : { value: 'Finalized', note: `${rows.length} employees paid out`, tone: 'success' };
}
