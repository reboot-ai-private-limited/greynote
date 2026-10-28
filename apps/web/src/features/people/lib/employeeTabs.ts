/**
 * The employee page's tabs (web refactor, 2026-10-13): each is one job. Profile (who they are: basic, address, work, documents), Team (managers above, people below), Pay (bank and
 * compensation), Time off (calendar and leave), Career (promotion history) and Access (devices and security: Admin only).
 */
export const EMPLOYEE_TABS = ['profile', 'team', 'pay', 'time', 'career', 'access'] as const;
export type EmployeeTab = (typeof EMPLOYEE_TABS)[number];

export const EMPLOYEE_TAB_LABEL: Record<EmployeeTab, string> = {
  profile: 'Profile',
  team: 'Team',
  pay: 'Pay',
  time: 'Time off',
  career: 'Career',
  access: 'Access',
};

/** The tabs of the page before it was regrouped, so a saved link or the CTC screen's "back" still lands in the right place. */
const OLD_TABS: Record<string, EmployeeTab> = {
  bank: 'pay',
  compensation: 'pay',
  documents: 'profile',
  calendar: 'time',
  leave: 'time',
  promotion: 'career',
  devices: 'access',
  security: 'access',
};

/** Which tab to open for a `?tab=` value: a current tab, an old tab's new home, or Profile. Access is for Admin and HR. */
export function employeeTabOf(requested: string | null | undefined, canView: boolean): EmployeeTab {
  const tab = requested && (EMPLOYEE_TABS as readonly string[]).includes(requested) ? (requested as EmployeeTab) : requested ? (OLD_TABS[requested] ?? 'profile') : 'profile';
  return tab === 'access' && !canView ? 'profile' : tab;
}

/** The tabs this person sees. */
export const employeeTabsFor = (canView: boolean): EmployeeTab[] => EMPLOYEE_TABS.filter((t) => t !== 'access' || canView);
