import type { RoleName } from '@greynote/contracts';
import {
  Award,
  Banknote,
  Calculator,
  CalendarRange,
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
  Inbox,
  FileText,
  Images,
  HandCoins,
  Stethoscope,
  Tags,
  Truck,
  Users,
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
  /** A second door to a screen whose main entry is in another group: listed, but the screen counts as belonging to the main one. */
  secondDoor?: boolean;
  /** Other screens that belong to this item (reached from it, not listed in the rail). */
  alsoOpens?: readonly string[];
  /** Roles that see this item. Cosmetic: the API returns 403 regardless. */
  roles: readonly RoleName[];
  /** Backend exists but the screen is not built yet: rendered disabled. */
  comingSoon?: boolean;
}

/** The groups, in the order the rail shows them (most-used first). Home is what people open every day, so it is always open. */
export const NAV_GROUPS = [
  { name: 'Home', alwaysOpen: true },
  { name: 'HR', alwaysOpen: false },
  { name: 'Sales & Distribution', alwaysOpen: false },
  { name: 'Payouts', alwaysOpen: false },
  { name: 'Reports', alwaysOpen: false },
  { name: 'Master data', alwaysOpen: false },
  { name: 'System', alwaysOpen: false },
] as const;
export type NavGroupName = (typeof NAV_GROUPS)[number]['name'];

const ALL: readonly RoleName[] = ['ADMIN', 'HR', 'ACCOUNTANT'];

/** The portal's navigation. Mirrors `apps/api/src/modules/*`; PRD §4 decides who sees what. Order here is the order within a group. */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Home', roles: ALL },
  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, group: 'Home', roles: ['ADMIN', 'HR'] },

  { label: 'Employees', href: '/employees', icon: Users, group: 'HR', roles: ['ADMIN', 'HR'] },
  { label: 'Attendance', href: '/attendance', icon: CalendarCheck, group: 'HR', roles: ALL },
  { label: 'Leave & holidays', href: '/hr', icon: CalendarDays, group: 'HR', roles: ['ADMIN', 'HR'] },
  { label: 'Promotions', href: '/promotions', icon: TrendingUp, group: 'HR', roles: ['ADMIN', 'HR'] },
  { label: 'Late submissions', href: '/late-submissions', icon: Clock, group: 'HR', roles: ['ADMIN'] },
  { label: 'Documents', href: '/documents', icon: FileText, group: 'HR', roles: ['ADMIN'] },
  { label: 'Inbox messages', href: '/inbox', icon: Inbox, group: 'HR', roles: ['ADMIN'] },
  { label: 'Devices', href: '/devices', icon: Smartphone, group: 'HR', roles: ['ADMIN'] },

  { label: 'Sales dashboard', href: '/reports/sales-dashboard', icon: LayoutDashboard, group: 'Sales & Distribution', roles: ['ADMIN'] },
  { label: 'Orders', href: '/orders', icon: ShoppingCart, group: 'Sales & Distribution', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Distributors', href: '/distributors', icon: Truck, group: 'Sales & Distribution', roles: ['ADMIN', 'ACCOUNTANT'] },

  { label: 'Expenses', href: '/expenses', alsoOpens: ['/expense-months', '/expense-payouts', '/late-expenses'], icon: Receipt, group: 'Payouts', roles: ['ADMIN', 'HR', 'ACCOUNTANT'] },
  { label: 'Payroll', href: '/payroll', icon: Banknote, group: 'Payouts', roles: ['ADMIN', 'HR', 'ACCOUNTANT'] },
  { label: 'Expense claims', href: '/expense-claims', icon: CalendarRange, group: 'Payouts', roles: ['ADMIN', 'ACCOUNTANT'] },

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
  { label: 'Distributors', href: '/distributors', icon: Truck, group: 'Master data', section: 'Outlets', roles: ['ADMIN'], secondDoor: true },
  { label: 'Chemists', href: '/chemists', icon: Pill, group: 'Master data', section: 'Outlets', roles: ['ADMIN'] },
  { label: 'Products', href: '/products', icon: Package, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Specialities', href: '/specialties', icon: Tags, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Doctor services', href: '/doctor-services', icon: HandCoins, group: 'Master data', section: 'Catalogue', roles: ['ADMIN', 'ACCOUNTANT'] },
  { label: 'Doctor gifts', href: '/doctor-gifts', icon: Gift, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Visuals', href: '/visuals', icon: Images, group: 'Master data', section: 'Catalogue', roles: ['ADMIN'] },
  { label: 'Designations', href: '/designations', icon: Award, group: 'Master data', section: 'HR setup', roles: ['ADMIN', 'HR'] },
  { label: 'Leave setup', href: '/leave-setup', icon: CalendarDays, group: 'Master data', section: 'HR setup', roles: ['ADMIN', 'HR'] },
  { label: 'Pay grades', href: '/pay-grades', alsoOpens: ['/pay-bands'], icon: Wallet, group: 'Master data', section: 'Pay structure', roles: ALL },
  { label: 'Pay components', href: '/pay-components', icon: Calculator, group: 'Master data', section: 'Pay structure', roles: ALL },

  { label: 'System settings', href: '/settings', icon: Settings2, group: 'System', roles: ['ADMIN'] },
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
const under = (href: string, pathname: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

export const isActiveItem = (item: Pick<NavItem, 'href'> & { alsoOpens?: readonly string[] }, pathname: string): boolean =>
  under(item.href, pathname) || (item.alsoOpens ?? []).some((h) => under(h, pathname));

/**
 * Whether `role` may open the screen at `pathname`: the roles of the item it belongs to (the longest matching item wins, so
 * `/reports/sales-dashboard` is not read as `/reports/sales`). A path no item claims is not refused here: it is a 404 or a shared screen.
 */
export function canOpen(role: RoleName, pathname: string): boolean {
  const owners = NAV_ITEMS.filter((i) => isActiveItem(i, pathname));
  if (owners.length === 0) return true;
  const longest = Math.max(...owners.map((i) => i.href.length));
  const exception = Object.entries(ADMIN_ONLY_SCREENS).find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (exception && !exception[1].includes(role)) return false;
  return owners.some((i) => i.href.length === longest && i.roles.includes(role));
}

/** Screens inside a shared area that only some of its roles may open (the Accountant reads distributors but never adds one). */
const ADMIN_ONLY_SCREENS: Readonly<Record<string, readonly RoleName[]>> = { '/distributors/new': ['ADMIN'] };

/** The group that holds the screen being looked at, if any. */
export function activeGroupOf(role: RoleName, pathname: string): NavGroupName | null {
  return navGroupsFor(role).find((g) => g.items.some((i) => !i.secondDoor && isActiveItem(i, pathname)))?.group ?? navGroupsFor(role).find((g) => g.items.some((i) => isActiveItem(i, pathname)))?.group ?? null;
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
