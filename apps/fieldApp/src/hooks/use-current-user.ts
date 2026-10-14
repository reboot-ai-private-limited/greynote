import { useSessionUser } from '@/lib/session';

import { useIsManager } from './use-is-manager';

/**
 * The logged-in employee, as the screens need it. Filled from the login response's `user`
 * (src/lib/session.ts). Screens should only ever read the user through this hook.
 *
 * `designation` shows the role (the response carries only a designationId). `isManager` is worked out from the
 * approvals lists (see use-is-manager.ts) because the backend has no "has direct reports" flag yet.
 */
export type CurrentUser = {
  name: string;
  employeeCode: string;
  designation: string;
  /** The profile picture's address, or null when the employee has none. */
  photoUrl: string | null;
  /** ASM/RSM/ZSM/NSM — anyone with direct reports. Shows the Team tab (PRD §6.1, §7.1). */
  isManager: boolean;
};

const SIGNED_OUT: CurrentUser = { name: '', employeeCode: '', designation: '', photoUrl: null, isManager: false };

export function useCurrentUser(): CurrentUser {
  const user = useSessionUser();
  const isManager = useIsManager(user?.id, user?.role);
  if (!user) return SIGNED_OUT;
  return {
    name: user.name,
    employeeCode: user.employeeCode,
    designation: user.role,
    photoUrl: user.photoUrl ?? null,
    isManager,
  };
}
