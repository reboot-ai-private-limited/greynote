import type { RoleName } from '@greynote/contracts';
import {
  Award,
  Banknote,
  Calculator,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  Map as MapIcon,
  Package,
  Pill,
  Receipt,
  Route,
  Settings2,
  Smartphone,
  Gift,
  Images,
  HandCoins,
  Stethoscope,
  Tags,
  Truck,
  Users,
  Coins,
  Wallet,
  BarChart3,
  Boxes,
  CalendarCheck,
  PiggyBank,
  ClipboardList,
  MapPinned,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group: NavGroupName;
  /** A smaller heading inside a long group (Master data), shown while that group is open. */
  section?: string;
  /** Roles that see this item. Cosmetic: the API returns 403 regardless. */
  roles: readonly RoleName[];
  /** Backend exists but the screen is not built yet: rendered disabled. */
  comingSoon?: boolean;
}

/** The groups, in the order the rail shows them. Home and Daily work are what people open every day, so they are always open. */
export const NAV_GROUPS = [
  { name: 'Home', alwaysOpen: true },
  { name: 'Daily work', alwaysOpen: true },
  { name: 'People', alwaysOpen: false },
  { name: 'Money', alwaysOpen: false },
  { name: 'Reports', alwaysOpen: false },
  { name: 'Master data', alwaysOpen: false },
  { name: 'Setup', alwaysOpen: false },
] as const;
export type NavGroupName = (typeof NAV_GROUPS)[number]['name'];

const ALL: readonly RoleName[] = ['ADMIN', 'HR', 'ACCOUNTANT'];

/** The portal's navigation. Mirrors `apps/api/src/modules/*`; PRD §4 decides who sees what. Order here is the order within a group. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Home', roles: ALL },

  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, group: 'Daily work', roles: ['ADMIN', 'HR'] },
  { label: 'Late submissions', href: '/late-submissions', icon: Clock, group: 'Daily work', roles: ['ADMIN'] },
  { label: 'Late expenses', href: '/late-expenses', icon: Clock, group: 'Daily work', roles: ['ADMIN'] },
  { label: 'Attendance', href: '/attendance', icon: CalendarCheck, group: 'Daily work', roles: ALL },
  { label: 'Orders', href: '/orders', icon: ShoppingCart, group: 'Daily work', roles: ['ADMIN'] },

  { label: 'Employees', href: '/employees', icon: Users, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Promotions', href: '/promotions', icon: TrendingUp, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Leave & holidays', href: '/hr', icon: CalendarDays, group: 'People', roles: ['ADMIN', 'HR'] },
  { label: 'Devices', href: '/devices', icon: Smartphone, group: 'People', roles: ['ADMIN'] },

  { label: 'Payroll', href: '/payroll', icon: Banknote, group: 'Money', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Expenses', href: '/expenses', icon: Receipt, group: 'Money', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Expense payouts', href: '/expense-payouts', icon: Coins, group: 'Money', roles: ['ADMIN', 'ACCOUNTANT'] },

  { label: 'Sales dashboard', href: '/reports/sales-dashboard', icon: LayoutDashboard, group: 'Reports', roles: ['ADMIN'] },
  { label: 'Sales report', href: '/reports/sales', icon: BarChart3, group: 'Reports', roles: ['ADMIN'] },
  { label: 'Stock report', href: '/reports/stock', icon: Boxes, group: 'Reports', roles: ['ADMIN'] },
  { label: 'Daily reports', href: '/reports/dcr', icon: ClipboardList, group: 'Reports', roles: ['ADMIN'] },
  { label: 'Doctor visits', href: '/reports/doctor-visits', icon: Stethoscope, group: 'Reports', roles: ['ADMIN'] },
  { label: 'TA/DA report', href: '/reports/ta-da', icon: MapPinned, group: 'Reports', roles: ['ADMIN'] },
  { label: 'Salary report', href: '/reports/salary', icon: PiggyBank, group: 'Reports', roles: ['ADMIN'] },

  { label: 'Zones', href: '/zones', icon: MapIcon, group: 'Master data', section: 'Territory', roles: ['ADMIN'] },
  { label: 'HQs', href: '/hqs', icon: Building2, group: 'Master data', section: 'Territory', roles: ['ADMIN'] },
  { label: 'Routes', href: '/routes', icon: Route, group: 'Master data', section: 'Territory', roles: ['ADMIN'] },
  { label: 'Doctors', href: '/doctors', icon: Stethoscope, group: 'Master data', section: 'Outlets', roles: ['ADMIN'] },
  { label: 'Distributors', href: '/distributors', icon: Truck, group: 'Master data', section: 'Outlets', roles: ['ADMIN'] },
  { label: 'Chemists', href: '/chemists', icon: Pill, group: 'Master data', section: 'Outlets', roles: ['ADMIN'] },
  { label: 'Products', href: '/products', icon: Package, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Specialities', href: '/specialties', icon: Tags, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Doctor services', href: '/doctor-services', icon: HandCoins, group: 'Master data', section: 'Catalogue', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Doctor gifts', href: '/doctor-gifts', icon: Gift, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Visuals', href: '/visuals', icon: Images, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },

  { label: 'Designations', href: '/designations', icon: Award, group: 'Setup', roles: ['ADMIN', 'HR'] },
  { label: 'Pay grades', href: '/pay-grades', icon: Wallet, group: 'Setup', roles: ALL },
  { label: 'Pay components', href: '/pay-components', icon: Calculator, group: 'Setup', roles: ALL },
  { label: 'System settings', href: '/settings', icon: Settings2, group: 'Setup', roles: ['ADMIN'] },
];

export function navFor(role: RoleName): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export interface NavGroup {
  group: NavGroupName;
  /** Home and Daily work: always showing, with nothing to open or close. */
  alwaysOpen: boolean;
  items: readonly NavItem[];
}

/** The visible items under their headings, groups in the rail's order, empty groups dropped. */
export function navGroupsFor(role: RoleName): NavGroup[] {
  const visible = navFor(role);
  return NAV_GROUPS.map((g) => ({ group: g.name, alwaysOpen: g.alwaysOpen, items: visible.filter((i) => i.group === g.name) })).filter((g) => g.items.length > 0);
}

/** Whether the screen at `pathname` is this item's (the item itself or anything under it). */
export const isActiveItem = (item: Pick<NavItem, 'href'>, pathname: string): boolean => pathname === item.href || pathname.startsWith(`${item.href}/`);

/** The group that holds the screen being looked at, if any. */
export function activeGroupOf(role: RoleName, pathname: string): NavGroupName | null {
  return navGroupsFor(role).find((g) => g.items.some((i) => isActiveItem(i, pathname)))?.group ?? null;
}

/** The open groups as remembered in the browser: a JSON list of group names; anything else, or a name that is not a group, is ignored. */
export function parseOpenGroups(raw: string | null): NavGroupName[] {
  try {
    const value: unknown = raw === null ? [] : JSON.parse(raw);
    const known = new Set<string>(NAV_GROUPS.map((g) => g.name));
    return Array.isArray(value) ? value.filter((v): v is NavGroupName => typeof v === 'string' && known.has(v)) : [];
  } catch {
    return [];
  }
}

/** Opens or closes one group; the others are left as they are. */
export function toggleGroup(open: readonly NavGroupName[], group: NavGroupName): NavGroupName[] {
  return open.includes(group) ? open.filter((g) => g !== group) : [...open, group];
}

/** Makes sure a group is open (the one holding the current screen); returns the same list when it already is. */
export function withGroupOpen(open: readonly NavGroupName[], group: NavGroupName | null): readonly NavGroupName[] {
  return group === null || open.includes(group) ? open : [...open, group];
}

/** True when the screen behind `href` exists. Tiles and links only point at built screens. */
export function isRouteBuilt(href: string): boolean {
  return NAV_ITEMS.some((item) => item.href === href && !item.comingSoon);
}
