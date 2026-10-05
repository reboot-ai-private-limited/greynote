import type { CtcLine } from './ctcBreakdown.js';

/**
 * One revision of a FIELD employee's CTC. Append-only: a change of package is a new revision with a later (or the
 * same) `effectiveFrom`, never an edit — history is what payroll for past months was computed from. `lines` is the
 * breakdown frozen when the revision was saved, so editing the org formula later never rewrites it.
 */
export interface CtcAssignment {
  id: string;
  userId: string;
  ctcAnnualPaise: number;
  /** `YYYY-MM` — the first payroll month this revision applies to. */
  effectiveFrom: string;
  /** Per-employee line amounts HR typed (component code → annual paise); kept so a re-apply can preserve them. */
  overrides: Record<string, number>;
  lines: CtcLine[];
  reason: string | null;
  createdBy: string;
  createdAt: Date;
}
