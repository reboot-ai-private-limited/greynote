import type { RoleName } from '@greynote/contracts';
import {
  Banknote,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Map as MapIcon,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: string;
  /** Roles that see this item. Cosmetic: the API returns 403 regardless. */
  roles: readonly RoleName[];
  /** Backend exists but the screen is not built yet: rendered disabled. */
  comingSoon?: boolean;
}

const ALL: readonly RoleName[] = ['ADMIN', 'HR', 'ACCOUNTANT'];

/** The portal's navigation. Mirrors `apps/api/src/modules/*`; PRD §4 decides who sees what. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Overview', roles: ALL },
  { label: 'Territory', href: '/territory', icon: MapIcon, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Employees', href: '/employees', icon: Users, group: 'People', roles: ALL, comingSoon: true },
  { label: 'Leave & holidays', href: '/hr', icon: CalendarDays, group: 'People', roles: ['ADMIN', 'HR'], comingSoon: true },
  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, group: 'Operations', roles: ['ADMIN'], comingSoon: true },
  { label: 'Expenses', href: '/expenses', icon: Receipt, group: 'Operations', roles: ['ADMIN', 'ACCOUNTANT'], comingSoon: true },
  { label: 'Payroll', href: '/payroll', icon: Banknote, group: 'Operations', roles: ['ADMIN', 'ACCOUNTANT'], comingSoon: true },
];

export function navFor(role: RoleName): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** The visible items, in order, grouped under their heading. */
export function navGroupsFor(role: RoleName): { group: string; items: readonly NavItem[] }[] {
  const groups = new Map<string, NavItem[]>();
  for (const item of navFor(role)) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  return [...groups].map(([group, items]) => ({ group, items }));
}

/** True when the screen behind `href` exists. Tiles and links only point at built screens. */
export function isRouteBuilt(href: string): boolean {
  return NAV_ITEMS.some((item) => item.href === href && !item.comingSoon);
}
