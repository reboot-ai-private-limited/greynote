/**
 * The fault-code taxonomy every `AppError` carries.
 *
 * Kept deliberately small and generic for now — extend it per-module as real failure modes
 * show up (e.g. sync/geofence/compliance codes once `docs/hld/01-sync-and-geofencing.md` and
 * `docs/hld/10-submission-gating-and-compliance-block.md` get built). Driverzone additionally
 * splits out an `UNAVAILABLE_REASONS` tier for "expected non-error" answers (HTTP 200,
 * `available: false`) — there's no analog in greynote's domain yet, so it's intentionally not
 * ported until one exists.
 */
export const FAULT_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  /** A Plan submitted after its deadline without a late-submission exception (409). */
  'PLAN_SUBMIT_LATE',
  /** The request body is bigger than the server accepts (413). */
  'PAYLOAD_TOO_LARGE',
  /** An external dependency (e.g. Google Maps) is unconfigured or down — retry later. */
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;

export type FaultCode = (typeof FAULT_CODES)[number];
