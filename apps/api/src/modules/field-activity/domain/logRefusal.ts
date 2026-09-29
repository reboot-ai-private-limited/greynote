/** The codes a refused call or follow-up carries, beyond the gate's (LLD field-activity.md, *Calls*). */
export const LOG_CODES = {
  invalidPayload: 'INVALID_PAYLOAD',
  doctorNotFound: 'DOCTOR_NOT_FOUND',
  doctorNotAssigned: 'DOCTOR_NOT_ASSIGNED',
  chemistNotFound: 'CHEMIST_NOT_FOUND',
  chemistRouteNotAssigned: 'CHEMIST_ROUTE_NOT_ASSIGNED',
  invalidWorkWith: 'INVALID_WORK_WITH',
  noSampleAllocation: 'NO_SAMPLE_ALLOCATION',
  samplesExhausted: 'SAMPLES_EXHAUSTED',
} as const;
export type LogCode = (typeof LOG_CODES)[keyof typeof LOG_CODES];

/**
 * A call or follow-up refused because of what it refers to — a Doctor the MR no longer has, a sample
 * allocation that ran out. Like `GateRefusal`, a plain domain error so the same use case serves the sync
 * handlers (which turn it into a `SyncRejection`) and anything else.
 */
export class LogRefusal extends Error {
  constructor(
    readonly code: LogCode,
    message: string,
  ) {
    super(message);
    this.name = 'LogRefusal';
  }
}
