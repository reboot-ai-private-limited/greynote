export const PROMOTION_STATUSES = ['SCHEDULED', 'APPLIED', 'CANCELLED'] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

/** One direct report of the promoted person and who they report to from the effective month. `toManagerId` equal to the promoted person means "stays". */
export interface PromotionTeamMove {
  userId: string;
  toManagerId: string;
}

/** The new CTC typed with the promotion; the revision itself is saved when the promotion applies. */
export interface PromotionCtc {
  ctcAnnualPaise: number;
  overrides: Record<string, number>;
}

/**
 * A change of designation, grade and/or manager that takes effect on the 1st of `effectiveFrom`, with the team handed over in
 * the same action. Nothing about the employee changes until it applies (decision-log 2026-10-06). The `from*` values are the
 * ones when it was scheduled, kept as history. `null` in a `to*` field means unchanged.
 */
export interface Promotion {
  id: string;
  userId: string;
  /** `YYYY-MM`: the month whose 1st it takes effect on. */
  effectiveFrom: string;
  status: PromotionStatus;
  fromDesignationId: string | null;
  toDesignationId: string | null;
  fromPayBandId: string | null;
  toPayBandId: string | null;
  fromManagerId: string | null;
  toManagerId: string | null;
  ctc: PromotionCtc | null;
  teamMoves: PromotionTeamMove[];
  reason: string | null;
  createdBy: string;
  createdAt: Date;
  /** The CTC revision created on applying, if the promotion carried a CTC. */
  ctcAssignmentId: string | null;
  appliedAt: Date | null;
  cancelledAt: Date | null;
}
