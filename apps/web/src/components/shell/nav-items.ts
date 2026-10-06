import type { RoleName } from '@greynote/contracts';
import {
  Award,
  Banknote,
  Calculator,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  Pill,
  Receipt,
  Route,
  Settings2,
  Smartphone,
  Stethoscope,
  Tags,
  Truck,
  Users,
  Coins,
  Wallet,
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
  { label: 'Zones', href: '/zones', icon: MapIcon, group: 'Master data', roles: ['ADMIN'] },
  { label: 'HQs', href: '/hqs', icon: Building2, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Doctors', href: '/doctors', icon: Stethoscope, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Distributors', href: '/distributors', icon: Truck, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Chemists', href: '/chemists', icon: Pill, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Products', href: '/products', icon: Package, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Specialities', href: '/specialties', icon: Tags, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Routes', href: '/routes', icon: Route, group: 'Master data', roles: ['ADMIN'] },
  { label: 'Employees', href: '/employees', icon: Users, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Devices', href: '/devices', icon: Smartphone, group: 'People', roles: ['ADMIN'] },
  { label: 'Pay grades', href: '/pay-grades', icon: Wallet, group: 'People', roles: ALL },
  { label: 'Pay components', href: '/pay-components', icon: Calculator, group: 'People', roles: ALL },
  { label: 'Designations', href: '/designations', icon: Award, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Leave & holidays', href: '/hr', icon: CalendarDays, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, group: 'Operations', roles: ['ADMIN', 'HR'] },
  { label: 'Expenses', href: '/expenses', icon: Receipt, group: 'Operations', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Expense payouts', href: '/expense-payouts', icon: Coins, group: 'Operations', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Payroll', href: '/payroll', icon: Banknote, group: 'Operations', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'System settings', href: '/settings', icon: Settings2, group: 'System', roles: ['ADMIN'] },
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
