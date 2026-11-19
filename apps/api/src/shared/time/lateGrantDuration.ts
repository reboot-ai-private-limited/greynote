/**
 * How long a late-submission exception lasts (decision-log 2026-11-19): only 30 minutes, 1 hour or 12 hours, from the moment it is granted. One list for the plan,
 * expense and unified grants and for their schemas, so no path accepts another length.
 */
export const LATE_GRANT_DURATIONS = ['30m', '1h', '12h'] as const;
export type LateGrantDuration = (typeof LATE_GRANT_DURATIONS)[number];
export const DEFAULT_LATE_GRANT_DURATION: LateGrantDuration = '1h';

const MINUTES: Record<LateGrantDuration, number> = { '30m': 30, '1h': 60, '12h': 720 };

/** The instant an exception granted at `now` ends. */
export const lateGrantEnd = (now: Date, duration: LateGrantDuration = DEFAULT_LATE_GRANT_DURATION): Date => new Date(now.getTime() + MINUTES[duration] * 60_000);
