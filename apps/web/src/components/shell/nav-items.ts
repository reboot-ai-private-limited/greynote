import type { RoleName } from '@greynote/contracts';

export interface NavItem {
  label: string;
  href: string;
  /** Roles that see this item. Cosmetic: the API returns 403 regardless. */
  roles: readonly RoleName[];
  /** Backend exists but the screen is not built yet: rendered disabled. */
  comingSoon?: boolean;
}

const ALL: readonly RoleName[] = ['ADMIN', 'HR', 'ACCOUNTANT'];

/** The portal's navigation. Mirrors `apps/api/src/modules/*`; PRD §4 decides who sees what. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', roles: ALL },
  { label: 'Zones', href: '/zones', roles: ['ADMIN'] },
  { label: 'Employees', href: '/employees', roles: ALL, comingSoon: true },
  { label: 'Leave & holidays', href: '/hr', roles: ['ADMIN', 'HR'], comingSoon: true },
  { label: 'Approvals', href: '/approvals', roles: ['ADMIN'], comingSoon: true },
  { label: 'Expenses', href: '/expenses', roles: ['ADMIN', 'ACCOUNTANT'], comingSoon: true },
  { label: 'Payroll', href: '/payroll', roles: ['ADMIN', 'ACCOUNTANT'], comingSoon: true },
];

export function navFor(role: RoleName): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
