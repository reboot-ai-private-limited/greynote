import type {
  ChemistCallDto,
  DcrDetailDto,
  DcrExpenseDto,
  DoctorCallDto,
  GeofenceOutcomeDto,
  GeofenceReason,
  GeofenceStatus,
  RecordRouteTypeDto,
  WorkingType,
} from '@greynote/contracts';
import type { BadgeTone } from '@/components/ui/Badge';

// ── Working type ───────────────────────────────────────────────────────────────────────────

export const WORKING_TYPE_LABEL: Record<WorkingType, string> = {
  FIELD_WORK: 'Field work',
  DOCTOR_CAMPAIGN: 'Doctor campaign',
  MEETING: 'Meeting',
  CONFERENCE: 'Conference',
  STRIKE: 'Strike',
};

/** A day of an out-station trip, shown beside the work type; an ordinary day shows nothing. */
export const DAY_KIND_LABEL = { STAY: 'Stay (DA only)', TRANSIT: 'Transit · return (TA, ex-station DA)' } as const;

/** The kind of Route a record was made on, shown beside the work type. */
export const ROUTE_TYPE_LABEL: Record<RecordRouteTypeDto, string> = {
  HQ: 'HQ',
  EX_STATION: 'Ex-station',
  OUT_STATION: 'Out-station',
};

// ── Geofence ───────────────────────────────────────────────────────────────────────────────

export const GEOFENCE_LABEL: Record<GeofenceStatus, string> = {
  PASS: 'Within range',
  FAIL: 'Out of range',
  UNVERIFIED: 'Could not verify',
  OVERRIDE: 'Accepted',
};

export const GEOFENCE_TONE: Record<GeofenceStatus, BadgeTone> = {
  PASS: 'success',
  FAIL: 'danger',
  UNVERIFIED: 'warning',
  OVERRIDE: 'accent',
};

const REASON_LABEL: Record<GeofenceReason, string> = {
  NO_REGISTERED_LOCATION: 'The place has no registered location to compare against.',
  NO_GPS_READING: 'The phone got no GPS reading.',
  LOW_ACCURACY: 'The GPS reading was too weak to trust.',
};

/** `1.2 km`, `85 m`. */
export function formatMeters(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** One sentence on what the check found: the distance on a fail, the reason on an unverified call. */
export function geofenceDetail(g: Pick<GeofenceOutcomeDto, 'status' | 'distanceMeters' | 'reason' | 'overrideComment'>): string {
  switch (g.status) {
    case 'PASS':
      return g.distanceMeters === null ? 'The phone was at the registered location.' : `${formatMeters(g.distanceMeters)} from the registered location.`;
    case 'FAIL':
      return g.distanceMeters === null ? 'The phone was too far from the registered location.' : `${formatMeters(g.distanceMeters)} from the registered location, beyond the allowed radius.`;
    case 'UNVERIFIED':
      return g.reason ? REASON_LABEL[g.reason] : 'The location could not be checked.';
    case 'OVERRIDE': {
      const was = g.distanceMeters !== null ? ` It was ${formatMeters(g.distanceMeters)} away.` : g.reason ? ` ${REASON_LABEL[g.reason]}` : '';
      return `Accepted${g.overrideComment ? `: “${g.overrideComment}”` : ''}.${was}`;
    }
  }
}

type AnyCall = DoctorCallDto | ChemistCallDto;

/** A call the reviewer may accept: the check flagged it and nobody has yet. */
export function isFlagged(call: Pick<AnyCall, 'geofence'>): boolean {
  return call.geofence.status === 'FAIL' || call.geofence.status === 'UNVERIFIED';
}

export function flaggedCalls(dcr: Pick<DcrDetailDto, 'doctorCalls' | 'chemistCalls'>): AnyCall[] {
  return [...dcr.doctorCalls, ...dcr.chemistCalls].filter(isFlagged);
}

/** "2 calls were flagged and not yet accepted", or `null` when there is nothing to say. */
export function flaggedNotice(dcr: Pick<DcrDetailDto, 'doctorCalls' | 'chemistCalls'>): string | null {
  const n = flaggedCalls(dcr).length;
  return n === 0 ? null : `${n} ${n === 1 ? 'call was' : 'calls were'} flagged by the location check and ${n === 1 ? 'has' : 'have'} not been accepted.`;
}

/** "1 doctor call was not in the day's plan", or `null` when every call was. */
export function notInPlanNotice(dcr: Pick<DcrDetailDto, 'doctorCalls'>): string | null {
  const n = dcr.doctorCalls.filter((c) => c.notInPlan).length;
  return n === 0 ? null : `${n} doctor ${n === 1 ? 'call was' : 'calls were'} not in the day’s plan.`;
}

/** "2 calls were on a route the plan did not list; 1 follow-up was not in the plan", or `null` when everything was on the plan. */
export function offPlanNotice(dcr: Pick<DcrDetailDto, 'doctorCalls' | 'chemistCalls' | 'followups'>): string | null {
  const calls = [...dcr.doctorCalls, ...dcr.chemistCalls].filter((c) => c.routeNotInPlan).length;
  const followups = dcr.followups.filter((f) => f.notInPlan).length;
  const parts = [
    calls > 0 ? `${calls} ${calls === 1 ? 'call was' : 'calls were'} on a route the plan did not list` : null,
    followups > 0 ? `${followups} ${followups === 1 ? 'follow-up was' : 'follow-ups were'} not in the plan` : null,
  ].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : `${parts.join('; ')}.`;
}

/**
 * Who may accept a flagged call, and when: Admin, while the report is with the manager or with Admin. The API enforces it;
 * this only decides whether to offer the button.
 */
export function canOverride(role: string | undefined, status: DcrDetailDto['status']): boolean {
  return role === 'ADMIN' && (status === 'SUBMITTED' || status === 'MANAGER_APPROVED');
}

// ── Expenses ───────────────────────────────────────────────────────────────────────────────

// One label per expense type, shared with the Accountant's audit.
export { EXPENSE_TYPE_LABEL } from '@/features/field-activity/lib/expenses';

/** The server's TA and DA first, then the MR's own claims. */
export function splitExpenses(expenses: readonly DcrExpenseDto[]): { auto: DcrExpenseDto[]; manual: DcrExpenseDto[] } {
  return { auto: expenses.filter((e) => e.source === 'AUTO'), manual: expenses.filter((e) => e.source === 'MANUAL') };
}

/** What is claimed: every row that is not cancelled. A cancelled row (the report was rejected) is not owed. */
export function claimedTotalPaise(expenses: readonly Pick<DcrExpenseDto, 'amountPaise' | 'paymentStatus'>[]): number {
  return expenses.filter((e) => e.paymentStatus !== 'CANCELLED').reduce((sum, e) => sum + e.amountPaise, 0);
}

/**
 * TA and DA are calculated when the manager approves, so while a report is still with the manager there are none, and
 * saying so is better than showing a blank.
 */
export function taDaNote(status: DcrDetailDto['status'], expenses: readonly DcrExpenseDto[]): string | null {
  if (expenses.some((e) => e.source === 'AUTO')) return null;
  if (status === 'SUBMITTED') return 'TA and DA are calculated when the manager approves.';
  return 'No TA or DA was calculated for this report.';
}

/** A TA row whose Route distance could not be calculated is artificially low: the reviewer must know. */
export function hasDistanceFlag(expenses: readonly Pick<DcrExpenseDto, 'distanceFlag'>[]): boolean {
  return expenses.some((e) => e.distanceFlag);
}

// ── The day at a glance ────────────────────────────────────────────────────────────────────

export interface DcrCounts {
  doctorCalls: number;
  chemistCalls: number;
  followups: number;
  samples: number;
}

export function dcrCounts(dcr: Pick<DcrDetailDto, 'doctorCalls' | 'chemistCalls' | 'followups'>): DcrCounts {
  return {
    doctorCalls: dcr.doctorCalls.length,
    chemistCalls: dcr.chemistCalls.length,
    followups: dcr.followups.length,
    samples: dcr.doctorCalls.reduce((n, c) => n + c.samples.reduce((m, s) => m + s.quantity, 0), 0),
  };
}

/** `3 doctor calls · 1 chemist call · 2 follow-ups`; a day with nothing logged says so. */
export function dcrCountsLabel(c: DcrCounts): string {
  const part = (n: number, one: string, many: string) => (n === 0 ? null : `${n} ${n === 1 ? one : many}`);
  const parts = [part(c.doctorCalls, 'doctor call', 'doctor calls'), part(c.chemistCalls, 'chemist call', 'chemist calls'), part(c.followups, 'follow-up', 'follow-ups')].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing was logged on this day.';
}

// ── Accepting a flagged call, and deciding the report ──────────────────────────────────────

export const OVERRIDE_REASON_MAX = 500;

/** Accepting a flagged call needs a reason, which is kept with the call beside what the check found. */
export function overrideReasonError(comment: string): string | undefined {
  const text = comment.trim();
  if (text === '') return 'Say why the call is accepted.';
  if (text.length > OVERRIDE_REASON_MAX) return `Keep the reason to ${OVERRIDE_REASON_MAX} characters.`;
  return undefined;
}

/**
 * What to tell the approver before they approve: that it skips the manager, and that approving the report does not
 * accept its flagged calls (they are separate actions, so a manager can accept two calls and still reject the day).
 */
export function approveWarnings(input: { skipsManager: boolean; flagged: number }): string[] {
  const out: string[] = [];
  if (input.skipsManager) out.push('This is still waiting on the manager. Approving now decides it at once, without them.');
  if (input.flagged > 0) {
    const n = input.flagged;
    out.push(`${n} flagged ${n === 1 ? 'call has' : 'calls have'} not been accepted. Approving the report does not accept ${n === 1 ? 'it' : 'them'}.`);
  }
  return out;
}
