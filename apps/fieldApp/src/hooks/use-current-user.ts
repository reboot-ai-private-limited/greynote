import { useSessionUser } from '@/lib/session';

/**
 * The logged-in employee, as the screens need it. Filled from the login response's `user`
 * (src/lib/session.ts). Screens should only ever read the user through this hook.
 *
 * TODO: `designation` shows the role (the response carries only a designationId) and `isManager`
 * is false — the backend exposes no "has direct reports" flag or designation name to the app yet,
 * so the Team tab stays hidden until it does.
 */
export type CurrentUser = {
  name: string;
  employeeCode: string;
  designation: string;
  /** ASM/RSM/ZSM/NSM — anyone with direct reports. Shows the Team tab (PRD §6.1, §7.1). */
  isManager: boolean;
};

const SIGNED_OUT: CurrentUser = { name: '', employeeCode: '', designation: '', isManager: false };

export function useCurrentUser(): CurrentUser {
  const user = useSessionUser();
  if (!user) return SIGNED_OUT;
  return {
    name: user.name,
    employeeCode: user.employeeCode,
    designation: user.role,
    isManager: false,
  };
}
