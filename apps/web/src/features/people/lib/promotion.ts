import type { PromotionPositionDto, PromotionRequestDto, PromotionStatus } from '@greynote/contracts';
import { fail, squash, type BuildResult } from '@/lib/forms';
import type { BadgeTone } from '@/components/ui/Badge';
import { parseCtc } from './ctc';

/**
 * The promotion form as strings → the request the API takes. `moves` maps a direct report's id to the manager they will have from
 * the effective month (the promoted person's own id means "stays with them"). Pure, so the rules are tested without a browser; the
 * server judges the rest (who is unplaced, loops, levels) and the screen shows its preview.
 */
export interface PromotionDraft {
  /** `YYYY-MM`. */
  effectiveFrom: string;
  designationId: string;
  payBandId: string;
  managerId: string;
  /** Rupees a year; empty leaves the CTC alone. */
  ctc: string;
  reason: string;
  moves: Record<string, string>;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month after `month` (`YYYY-MM`): a promotion starts on the 1st of a coming month. */
export function nextMonthOf(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export const emptyPromotionDraft = (currentMonth: string): PromotionDraft => ({
  effectiveFrom: nextMonthOf(currentMonth),
  designationId: '',
  payBandId: '',
  managerId: '',
  ctc: '',
  reason: '',
  moves: {},
});

export function buildPromotionRequest(d: PromotionDraft): BuildResult<PromotionRequestDto> {
  const errors: Record<string, string | undefined> = {};
  if (!MONTH_RE.test(d.effectiveFrom)) errors['effectiveFrom'] = 'Choose the month it starts.';
  const ctc = d.ctc.trim() === '' ? null : parseCtc(d.ctc);
  if (d.ctc.trim() !== '' && ctc === null) errors['ctc'] = 'Enter the yearly CTC in rupees, e.g. 144000.';
  if (d.reason.trim().length > 200) errors['reason'] = 'Keep the reason to 200 characters.';
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const reason = squash(d.reason);
  return {
    ok: true,
    body: {
      effectiveFrom: d.effectiveFrom,
      ...(d.designationId ? { toDesignationId: d.designationId } : {}),
      ...(d.payBandId ? { toPayBandId: d.payBandId } : {}),
      ...(d.managerId ? { toManagerId: d.managerId } : {}),
      ...(ctc !== null ? { ctc: { ctcAnnualPaise: ctc } } : {}),
      teamMoves: Object.entries(d.moves)
        .filter(([, to]) => to !== '')
        .map(([userId, toManagerId]) => ({ userId, toManagerId })),
      ...(reason ? { reason } : {}),
    },
  };
}

/** Puts every id in `userIds` under `managerId`. Others keep what they had. */
export function assignMoves(moves: Readonly<Record<string, string>>, userIds: readonly string[], managerId: string): Record<string, string> {
  const next = { ...moves };
  for (const id of userIds) next[id] = managerId;
  return next;
}

/** Takes the placement away from `userIds`. */
export function clearMoves(moves: Readonly<Record<string, string>>, userIds: readonly string[]): Record<string, string> {
  const next = { ...moves };
  for (const id of userIds) delete next[id];
  return next;
}

/** The team members with no manager chosen yet. */
export function unplacedIds(teamIds: readonly string[], moves: Readonly<Record<string, string>>): string[] {
  return teamIds.filter((id) => !moves[id]);
}

/** What changes between two positions, one phrase each; empty when nothing does. */
export function changeSummary(from: PromotionPositionDto, to: PromotionPositionDto): string[] {
  const out: string[] = [];
  if (from.designation !== to.designation) out.push(`Designation ${from.designation ?? 'none'} → ${to.designation ?? 'none'}`);
  if (from.payBand?.id !== to.payBand?.id) out.push(`Grade ${from.payBand?.name ?? 'none'} → ${to.payBand?.name ?? 'none'}`);
  if (from.manager?.id !== to.manager?.id) out.push(`Manager ${from.manager?.name ?? 'none'} → ${to.manager?.name ?? 'none'}`);
  return out;
}

export const PROMOTION_STATUS_LABEL: Record<PromotionStatus, string> = { SCHEDULED: 'Scheduled', APPLIED: 'Applied', CANCELLED: 'Cancelled' };
export const PROMOTION_STATUS_TONE: Record<PromotionStatus, BadgeTone> = { SCHEDULED: 'accent', APPLIED: 'success', CANCELLED: 'neutral' };

/** "1 Nov 2026" from `2026-11`. */
export function monthStartLabel(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `1 ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
