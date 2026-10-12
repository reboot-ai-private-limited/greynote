import { AppError } from '@/shared/errors/AppError.js';

/** Anything that can say who is below a manager; Identity's public contract satisfies it. */
export type DownlineSource = (managerId: string) => Promise<ReadonlyArray<{ id: string }>>;

/**
 * Whose records a manager's team read covers: the one person asked for, or the whole downline. A person outside the
 * downline is a 403, never an empty list, so a manager can't probe who exists. The one place this rule lives — every
 * team route uses it rather than re-deriving "is this person mine?".
 */
export async function resolveTeamScope(
  downline: DownlineSource,
  managerId: string,
  requestedUserId?: string,
): Promise<string[]> {
  return narrowToTeam(
    (await downline(managerId)).map((m) => m.id),
    requestedUserId,
  );
}

/** `resolveTeamScope` for a caller that already holds the downline's ids. */
export function narrowToTeam(downlineIds: readonly string[], requestedUserId?: string): string[] {
  if (requestedUserId === undefined) return [...downlineIds];
  if (!downlineIds.includes(requestedUserId))
    throw AppError.forbidden('That employee is not in your team.');
  return [requestedUserId];
}
