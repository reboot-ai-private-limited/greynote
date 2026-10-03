import type {
  ApprovalActionDto,
  ApprovalAuthority,
  ApprovalActionType,
  ApprovalInboxItemDto,
  ApprovalStatus,
  BulkDecideDto,
  BulkResultDto,
} from '@greynote/contracts';
import { MAX_BULK_DECISIONS } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';
import { zoneOffset } from '@/lib/siteConfig';

// ── Kinds ──────────────────────────────────────────────────────────────────────────────────

/** What each request kind is called. A kind the portal does not know is shown humanised, never hidden. */
export const KIND_LABEL: Record<string, string> = {
  NEW_DOCTOR: 'New doctor',
  LEAVE: 'Leave',
  DCR: 'Daily report',
  DOCTOR_SERVICE: 'Doctor service',
  DAILY_PLAN: 'Daily plan',
  MONTHLY_PLAN: 'Monthly plan',
  DAILY_PLAN_CHANGE: 'Plan change',
};

export function kindLabel(kind: string): string {
  const known = KIND_LABEL[kind];
  if (known) return known;
  const words = kind.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const KIND_OPTIONS = Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }));

// ── Status and stage ───────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  SUBMITTED: 'Submitted',
  MANAGER_APPROVED: 'Manager approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  REOPENED: 'Reopened',
};

export const STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  SUBMITTED: 'warning',
  MANAGER_APPROVED: 'accent',
  APPROVED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  REOPENED: 'neutral',
};

export const OPEN_STATUSES: readonly ApprovalStatus[] = ['SUBMITTED', 'MANAGER_APPROVED'];
export const isOpen = (status: ApprovalStatus): boolean => OPEN_STATUSES.includes(status);

/** Leave is finalised by HR or Admin; every other kind by Admin. Mirrors the kinds' registration in the API. */
export function finalApproverLabel(kind: string): string {
  return kind === 'LEAVE' ? 'HR or Admin' : 'Admin';
}

/** Who a request is waiting on, or how it ended. */
export function stageLabel(item: Pick<ApprovalInboxItemDto, 'kind' | 'status' | 'workflow'>): string {
  switch (item.status) {
    case 'SUBMITTED':
      return 'Waiting on the manager';
    case 'MANAGER_APPROVED':
      return `Waiting on ${finalApproverLabel(item.kind)}`;
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'WITHDRAWN':
      return 'Withdrawn by the employee';
    case 'REOPENED':
      return 'Reopened for changes';
  }
}

/**
 * True when approving now would decide a request that is still waiting on the manager: Admin's override.
 * Said in the confirmation, because it skips a stage. (A request from someone with no manager is
 * decided by Admin as the ordinary top of the chain; the history records which it was.)
 */
export function skipsManager(item: Pick<ApprovalInboxItemDto, 'status'>, actorRole: string | undefined): boolean {
  return item.status === 'SUBMITTED' && actorRole === 'ADMIN';
}

// ── History ────────────────────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<ApprovalActionType, string> = {
  SUBMIT: 'Submitted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  WITHDRAW: 'Withdrawn',
  RESUBMIT: 'Resubmitted',
  REOPEN: 'Reopened',
};

const AUTHORITY_LABEL: Record<ApprovalAuthority, string> = {
  SUBMITTER: 'the employee',
  MANAGER: 'as the manager',
  ADMIN_OVERRIDE: 'as an Admin override',
  AUTO: 'automatically (approval not required)',
  TOP_OF_CHAIN: 'as the top of the chain',
  FINAL: 'as a final approver',
};

/** `Approved as an Admin override`, `Submitted`. The authority is shown for decisions, where it matters. */
export function actionLabel(a: Pick<ApprovalActionDto, 'action' | 'authority'>): string {
  const base = ACTION_LABEL[a.action];
  const decision = a.action === 'APPROVE' || a.action === 'REJECT' || a.action === 'REOPEN';
  return decision ? `${base} ${AUTHORITY_LABEL[a.authority]}` : base;
}

export function actionTone(action: ApprovalActionType): BadgeTone {
  switch (action) {
    case 'APPROVE':
      return 'success';
    case 'REJECT':
      return 'danger';
    case 'SUBMIT':
    case 'RESUBMIT':
      return 'accent';
    default:
      return 'neutral';
  }
}

/** The history grouped by submission round, newest round first, so a resubmission reads as its own chapter. */
export function groupByCycle(history: readonly ApprovalActionDto[]): { cycle: number; actions: ApprovalActionDto[] }[] {
  const byCycle = new Map<number, ApprovalActionDto[]>();
  for (const a of history) byCycle.set(a.cycle, [...(byCycle.get(a.cycle) ?? []), a]);
  return [...byCycle]
    .map(([cycle, actions]) => ({ cycle, actions }))
    .sort((a, b) => b.cycle - a.cycle);
}

// ── Dates ──────────────────────────────────────────────────────────────────────────────────

/**
 * The API takes instants with an offset, never a bare date, because the server has no business timezone.
 * "From the 1st to the 3rd" is the start of the 1st and the last millisecond of the 3rd, in the business timezone (with its offset on those days).
 */
export function dateRangeToInstants(from: string, to: string): { from?: string; to?: string } {
  return {
    ...(from && { from: `${from}T00:00:00.000${zoneOffset(from)}` }),
    ...(to && { to: `${to}T23:59:59.999${zoneOffset(to)}` }),
  };
}

/** An error for a reversed range, so the form says so rather than the server's 400. */
export function dateRangeError(from: string, to: string): string | undefined {
  return from && to && from > to ? 'The end date is before the start date.' : undefined;
}

// ── Deciding ───────────────────────────────────────────────────────────────────────────────

export const REASON_MAX = 1000;

/** A rejection and a reopening need a reason; an approval does not. */
export function reasonError(reason: string, required: boolean): string | undefined {
  const text = reason.trim();
  if (required && text === '') return 'Give a reason.';
  if (text.length > REASON_MAX) return `Keep the reason to ${REASON_MAX} characters.`;
  return undefined;
}

// ── Bulk ───────────────────────────────────────────────────────────────────────────────────

/** Only rows the caller can act on, as the `{ id, cycle }` pairs the API wants. */
export function selectableRows<T extends Pick<ApprovalInboxItemDto, 'canAct' | 'status'>>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.canAct && isOpen(r.status));
}

export function buildBulkBody(
  decision: BulkDecideDto['decision'],
  rows: readonly Pick<ApprovalInboxItemDto, 'id' | 'cycle'>[],
  comment: string,
): BulkDecideDto {
  const text = comment.trim();
  return { decision, requests: rows.map((r) => ({ id: r.id, cycle: r.cycle })), ...(text !== '' && { comment: text }) };
}

/** More than 100 are sent in batches of 100, each its own request. */
export function chunkRows<T>(rows: readonly T[], size = MAX_BULK_DECISIONS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export interface BulkSummary {
  done: number;
  failed: { requestId: string; statusCode: number; message: string }[];
}

export function summariseBulk(results: readonly BulkResultDto[]): BulkSummary {
  const failed: BulkSummary['failed'] = [];
  let done = 0;
  for (const r of results) {
    if (r.ok) done += 1;
    else failed.push({ requestId: r.requestId, statusCode: r.statusCode, message: r.message });
  }
  return { done, failed };
}

/** "3 of 5 done" and, when something failed, what it was: a stale cycle reads differently from a fault. */
export function bulkMessage(summary: BulkSummary, total: number): string {
  if (summary.failed.length === 0) return `${summary.done} of ${total} done.`;
  return `${summary.done} of ${total} done. ${summary.failed.length} could not be decided: reload them and try again.`;
}

export const UNCONFIRMED_MESSAGE = 'Could not confirm: the connection failed. Reload and check before trying again.';

/**
 * Sends the rows in batches of 100, one request each, and always returns a result per row: a batch whose
 * request fails (a dropped connection, where the server may or may not have decided some) is reported as
 * unconfirmed for each of its rows, and the batches after it are not sent, so nothing is decided on a bad connection.
 */
export async function runBulk(
  send: (body: BulkDecideDto) => Promise<{ results: BulkResultDto[] }>,
  decision: BulkDecideDto['decision'],
  rows: readonly Pick<ApprovalInboxItemDto, 'id' | 'cycle'>[],
  comment: string,
): Promise<BulkResultDto[]> {
  const results: BulkResultDto[] = [];
  const batches = chunkRows(rows);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i] ?? [];
    try {
      results.push(...(await send(buildBulkBody(decision, batch, comment))).results);
    } catch {
      for (const row of batches.slice(i).flat()) {
        results.push({ requestId: row.id, ok: false, statusCode: 0, message: UNCONFIRMED_MESSAGE });
      }
      break;
    }
  }
  return results;
}
