import type { LateGrantKindDto, LateGrantStatusDto } from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';

export const GRANT_STATUS_LABEL: Record<LateGrantStatusDto, string> = {
  OPEN: 'Open',
  USED: 'Used',
  REVOKED: 'Revoked',
  EXPIRED: 'Expired',
};

export const GRANT_STATUS_TONE: Record<LateGrantStatusDto, BadgeTone> = {
  OPEN: 'success',
  USED: 'neutral',
  REVOKED: 'danger',
  EXPIRED: 'warning',
};

/** How far the zone is ahead of UTC at `instant`, in ms. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return (
    Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) -
    Math.floor(instant / 1000) * 1000
  );
}

/**
 * A wall-clock time typed in the business timezone (`2026-10-29T18:30`, from a datetime-local input) as an ISO instant —
 * the browser's own zone plays no part. `null` for something that is not a date and time.
 */
export function zonedToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const first = asUtc - zoneOffsetMs(asUtc, timeZone);
  const instant = asUtc - zoneOffsetMs(first, timeZone);
  return Number.isNaN(instant) ? null : new Date(instant).toISOString();
}

export const KIND_LABEL: Record<LateGrantKindDto, string> = {
  DAILY_PLAN: 'Daily plan',
  MONTHLY_PLAN: 'Monthly plan',
  EXPENSE_SUBMIT: 'Expenses — sending the month',
  EXPENSE_APPROVE: 'Expenses — approving the month',
  MONTHLY_STOCK: 'Monthly stock count',
  SECONDARY_SALES: 'Secondary sales and files',
  DCR_SUBMIT: 'Daily report',
};

/** The kinds grouped for the picker, in the order they are offered. */
export const KIND_GROUPS: ReadonlyArray<{ group: 'Plans' | 'Reports' | 'Expenses' | 'Sales'; kinds: readonly LateGrantKindDto[] }> = [
  { group: 'Plans', kinds: ['MONTHLY_PLAN', 'DAILY_PLAN'] },
  { group: 'Reports', kinds: ['DCR_SUBMIT'] },
  { group: 'Expenses', kinds: ['EXPENSE_SUBMIT', 'EXPENSE_APPROVE'] },
  { group: 'Sales', kinds: ['MONTHLY_STOCK', 'SECONDARY_SALES'] },
];

/** A daily plan and a daily report are named by their date; everything else by its month. */
export const isDayKind = (kind: LateGrantKindDto): boolean => kind === 'DAILY_PLAN' || kind === 'DCR_SUBMIT';

export const kindOptions = (groups?: readonly string[]) =>
  KIND_GROUPS.filter((g) => !groups || groups.includes(g.group)).flatMap((g) => g.kinds.map((value) => ({ value, label: `${g.group} · ${KIND_LABEL[value]}` })));

export interface GrantForm {
  userId: string;
  kind: LateGrantKindDto;
  periodKey: string;
  reason: string;
  /** datetime-local text in the business timezone; empty uses the default length. */
  expiresAt: string;
}

type Built =
  | { ok: true; body: { userId: string; kind: LateGrantKindDto; periodKey: string; reason: string; expiresAt?: string } }
  | { ok: false; errors: Record<string, string> };

/** Checks the form and builds the request. The server has the last word (future, locked periods, and within the longest allowed). */
export function buildGrant(form: GrantForm, timeZone: string, now: Date = new Date()): Built {
  const errors: Record<string, string> = {};
  if (!form.userId) errors['userId'] = 'Choose an employee.';
  const periodKey = form.periodKey.trim();
  const day = isDayKind(form.kind);
  const pattern = day ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!periodKey) errors['periodKey'] = day ? 'Choose the date.' : 'Choose the month.';
  else if (!pattern.test(periodKey)) errors['periodKey'] = 'Not a valid value.';
  const reason = form.reason.trim();
  if (!reason) errors['reason'] = 'A reason is required.';
  let expiresAt: string | undefined;
  if (form.expiresAt) {
    const iso = zonedToIso(form.expiresAt, timeZone);
    if (!iso) errors['expiresAt'] = 'Not a valid date and time.';
    else if (new Date(iso) <= now) errors['expiresAt'] = 'Pick a time in the future.';
    else expiresAt = iso;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, body: { userId: form.userId, kind: form.kind, periodKey, reason, ...(expiresAt && { expiresAt }) } };
}

export interface BulkGrantForm extends Omit<GrantForm, 'userId'> {
  userIds: string[];
}

type BulkBuilt =
  | { ok: true; body: { userIds: string[]; kind: LateGrantKindDto; periodKey: string; reason: string; expiresAt?: string } }
  | { ok: false; errors: Record<string, string> };

export const BULK_GRANT_MAX = 500;

/** Same checks as one grant, for a list of employees. The server checks each person; this only stops what could never work. */
export function buildBulkGrant(form: BulkGrantForm, timeZone: string, now: Date = new Date()): BulkBuilt {
  const { userIds, ...rest } = form;
  // Reuse the single form's period, reason and end checks with a stand-in employee.
  const built = buildGrant({ ...rest, userId: 'x' }, timeZone, now);
  const errors: Record<string, string> = built.ok ? {} : { ...built.errors };
  const unique = [...new Set(userIds)];
  if (unique.length === 0) errors['userIds'] = 'Choose at least one employee.';
  else if (unique.length > BULK_GRANT_MAX) errors['userIds'] = `At most ${BULK_GRANT_MAX} employees at a time.`;
  if (!built.ok || Object.keys(errors).length > 0) return { ok: false, errors };
  const { userId: _stand, ...body } = built.body;
  void _stand;
  return { ok: true, body: { ...body, userIds: unique } };
}

export const SKIP_LABEL = {
  GRANT_PERIOD_LOCKED: 'Period is settled',
  ALREADY_OPEN: 'Already allowed',
  NOT_ELIGIBLE: 'Not an active field employee',
  FORBIDDEN: 'Not in your team',
} as const;
