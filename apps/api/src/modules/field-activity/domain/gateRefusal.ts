/** The codes a refused log or submit carries — what the app tells the MR (LLD field-activity.md, *Submission gating*). */
export const GATE_CODES = {
  userBlocked: 'USER_BLOCKED',
  monthlyPlanNotApproved: 'MONTHLY_PLAN_NOT_APPROVED',
  planNotApproved: 'DAILY_PLAN_NOT_APPROVED',
  dateInFuture: 'DATE_IN_FUTURE',
  dateMismatch: 'DATE_MISMATCH',
  dcrLocked: 'DCR_LOCKED',
} as const;
export type GateCode = (typeof GATE_CODES)[keyof typeof GATE_CODES];

/**
 * A record or submit refused by the gate. A plain domain error, not an `AppError`, because the same gate
 * serves the sync handlers (which answer with a `SyncRejection` code) and any REST use, each translating it.
 */
export class GateRefusal extends Error {
  constructor(
    readonly code: GateCode,
    message: string,
  ) {
    super(message);
    this.name = 'GateRefusal';
  }
}
