import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeGroupOf, canOpen, isActiveItem, isRouteBuilt, NAV_ITEMS, navFor, navGroupsFor, parseOpenGroups, toggleGroup, withGroupOpen } from './nav-items';

describe('navFor', () => {
  it('gives ADMIN the zones screen', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/zones');
  });

  it('hides master data from HR and Accountant', () => {
    expect(navFor('HR').map((i) => i.href)).not.toContain('/zones');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/zones');
  });

  it('gives Accountant neither payroll nor leave', () => {
    const hrefs = navFor('ACCOUNTANT').map((i) => i.href);
    expect(hrefs).not.toContain('/payroll');
    expect(hrefs).not.toContain('/hr');
  });
});

describe('Routes', () => {
  it('is an Admin-only Master data screen', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/routes');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/routes');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/routes');
  });
});

describe('Employees', () => {
  it('is built, and shown to Admin and HR only (the users API is Admin/HR)', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/employees');
    expect(navFor('HR').map((i) => i.href)).toContain('/employees');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/employees');
    expect(isRouteBuilt('/employees')).toBe(true);
  });
});

describe('Field master data', () => {
  it.each(['/products', '/chemists', '/doctors'])('%s is an Admin-only Master data screen', (href) => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain(href);
    expect(navFor('HR').map((i) => i.href)).not.toContain(href);
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain(href);
    expect(isRouteBuilt(href)).toBe(true);
  });
});

describe('Approvals', () => {
  it('is built, and shown to Admin and HR (HR decides leave), not the Accountant', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/approvals');
    expect(navFor('HR').map((i) => i.href)).toContain('/approvals');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/approvals');
    expect(isRouteBuilt('/approvals')).toBe(true);
  });
});

describe('Leave & holidays', () => {
  it('is built, and shown to Admin and HR, not the Accountant (who only syncs unpaid leave through payroll)', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/hr');
    expect(navFor('HR').map((i) => i.href)).toContain('/hr');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/hr');
    expect(isRouteBuilt('/hr')).toBe(true);
  });
});

describe('Expense claims (the row-by-row list)', () => {
  it('is for Admin and the Accountant, not HR', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/expense-claims');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).toContain('/expense-claims');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/expense-claims');
    expect(canOpen('HR', '/expense-claims')).toBe(false);
    expect(isRouteBuilt('/expense-claims')).toBe(true);
  });
});

describe('Payroll', () => {
  it('is built, and shown to Admin and HR (who reviews and adjusts a draft), not the Accountant', () => {
    for (const role of ['ADMIN', 'HR'] as const) expect(navFor(role).map((i) => i.href)).toContain('/payroll');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/payroll');
    expect(isRouteBuilt('/payroll')).toBe(true);
  });
});

describe('System settings', () => {
  it('is built and Admin-only: HR and the Accountant never see it', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/settings');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/settings');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/settings');
    expect(isRouteBuilt('/settings')).toBe(true);
  });
});

describe('Devices', () => {
  it('is an Admin-only screen, since the device API is', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/devices');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/devices');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/devices');
    expect(isRouteBuilt('/devices')).toBe(true);
  });
});

describe('Pay grades and Designations', () => {
  it('lets Admin and HR see both', () => {
    for (const role of ['ADMIN', 'HR'] as const) {
      const hrefs = navFor(role).map((i) => i.href);
      expect(hrefs).toContain('/pay-grades');
      expect(hrefs).toContain('/designations');
    }
  });

  it('keeps pay grades and designations from the Accountant', () => {
    const hrefs = navFor('ACCOUNTANT').map((i) => i.href);
    expect(hrefs).not.toContain('/pay-grades');
    expect(hrefs).not.toContain('/designations');
  });
});

describe('Pay components', () => {
  it('lets Admin and HR see the formula, not the Accountant', () => {
    for (const role of ['ADMIN', 'HR'] as const) expect(navFor(role).map((i) => i.href)).toContain('/pay-components');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/pay-components');
    expect(isRouteBuilt('/pay-components')).toBe(true);
  });
});

describe('navGroupsFor', () => {
  it('groups items under their headings, in order, dropping empty groups', () => {
    const groups = navGroupsFor('ACCOUNTANT');
    expect(groups.map((g) => g.group)).toEqual(['Home', 'HR', 'Sales & Distribution', 'Payouts', 'Master data']);
    expect(groups.find((g) => g.group === 'Sales & Distribution')?.items.map((i) => i.href)).toEqual(['/reports/sales-dashboard', '/orders', '/invoices', '/distributors']);
    expect(groups.find((g) => g.group === 'Master data')?.items.map((i) => i.href)).toEqual(['/doctor-services']); // doctor services leave the Accountant in Step 0b
    expect(groups.find((g) => g.group === 'Payouts')?.items.map((i) => i.href)).toEqual(['/expenses', '/expense-claims']);
    expect(groups.find((g) => g.group === 'HR')?.items.map((i) => i.href)).toEqual(['/attendance']);
  });

  it('keeps Home always open, and every other group collapsible', () => {
    const groups = navGroupsFor('ADMIN');
    expect(groups.map((g) => g.group)).toEqual(['Home', 'HR', 'Sales & Distribution', 'Payouts', 'Reports', 'Master data', 'System']);
    expect(groups.filter((g) => g.alwaysOpen).map((g) => g.group)).toEqual(['Home']);
  });

  it('puts every screen in exactly one group', () => {
    const grouped = navGroupsFor('ADMIN').flatMap((g) => g.items.filter((i) => !i.secondDoor).map((i) => i.href));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.length).toBe(navFor('ADMIN').filter((i) => !i.secondDoor).length);
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(grouped.length);
  });
});

describe('open groups', () => {
  it('finds the group holding the screen being looked at, including a record opened from it', () => {
    expect(activeGroupOf('ADMIN', '/payroll/abc/slip')).toBe('Payouts');
    expect(activeGroupOf('ADMIN', '/reports/sales-dashboard/u1')).toBe('Sales & Distribution');
    expect(activeGroupOf('ADMIN', '/pay-bands')).toBe('Master data');
    expect(activeGroupOf('ADMIN', '/reports/sales')).toBe('Reports');
    expect(activeGroupOf('ADMIN', '/nowhere')).toBeNull();
    expect(isActiveItem({ href: '/payroll' }, '/payroll-other')).toBe(false);
  });

  it('reads what was remembered, ignoring junk and unknown names', () => {
    expect(parseOpenGroups(null)).toEqual([]);
    expect(parseOpenGroups('not json')).toEqual([]);
    expect(parseOpenGroups('["Payouts","Nope",3]')).toEqual(['Payouts']);
  });

  it('toggles a group and opens one without duplicating it', () => {
    expect(toggleGroup([], 'Payouts')).toEqual(['Payouts']);
    expect(toggleGroup(['Payouts'], 'Payouts')).toEqual([]);
    expect(withGroupOpen(['Payouts'], 'Payouts')).toEqual(['Payouts']);
    expect(withGroupOpen(['Payouts'], 'Reports')).toEqual(['Payouts', 'Reports']);
    expect(withGroupOpen(['Payouts'], null)).toEqual(['Payouts']);
  });
});

describe('Promotions', () => {
  it('is for Admin and HR only', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/promotions');
    expect(navFor('HR').map((i) => i.href)).toContain('/promotions');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/promotions');
    expect(isRouteBuilt('/promotions')).toBe(true);
  });
});

describe('Attendance', () => {
  it('is for Admin, HR and the Accountant', () => {
    for (const role of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).toContain('/attendance');
    expect(isRouteBuilt('/attendance')).toBe(true);
  });
});

describe('Orders', () => {
  it('is for Admin and the Accountant (who marks orders done), not HR', () => {
    for (const role of ['ADMIN', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).toContain('/orders');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/orders');
    expect(isRouteBuilt('/orders')).toBe(true);
  });
});

describe('Invoices', () => {
  it('are for Admin and the Accountant, not HR', () => {
    for (const role of ['ADMIN', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).toContain('/invoices');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/invoices');
    expect(isRouteBuilt('/invoices')).toBe(true);
  });
});

describe('Reports', () => {
  it('are for Admin only, in their own group', () => {
    const admin = navGroupsFor('ADMIN').find((g) => g.group === 'Reports');
    expect(admin?.items.map((i) => i.href)).toEqual(['/reports/sales', '/reports/stock', '/reports/dcr',
      '/reports/doctor-visits', '/reports/ta-da', '/reports/salary']);
    for (const role of ['HR', 'ACCOUNTANT'] as const) expect(navGroupsFor(role).some((g) => g.group === 'Reports')).toBe(false);
    expect(isRouteBuilt('/reports/sales')).toBe(true);
    expect(isRouteBuilt('/reports/sales-dashboard')).toBe(true);
  });
});

describe('Expenses (the month table, which replaced Expense payouts and Late expenses)', () => {
  it('is for Admin, HR (who reviews and edits) and the Accountant (who finalizes and pays)', () => {
    for (const role of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).toContain('/expenses');
    expect(canOpen('HR', '/expenses/u1')).toBe(true);
    expect(canOpen('HR', '/payroll')).toBe(true);
    expect(canOpen('HR', '/expense-claims')).toBe(false);
    expect(isRouteBuilt('/expenses')).toBe(true);
  });

  it('keeps the old addresses working, under Expenses', () => {
    for (const path of ['/expense-payouts', '/late-expenses', '/expense-months', '/expense-months/u1']) {
      expect(canOpen('ACCOUNTANT', path)).toBe(true);
      expect(activeGroupOf('ADMIN', path)).toBe('Payouts');
    }
  });
});

describe('Leave setup', () => {
  it('is HR setup under Master data, for Admin and HR (the leave types and master are theirs), not the Accountant', () => {
    for (const role of ['ADMIN', 'HR'] as const) expect(navFor(role).find((i) => i.href === '/leave-setup')).toMatchObject({ group: 'Master data', section: 'HR setup' });
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/leave-setup');
    expect(canOpen('ACCOUNTANT', '/leave-setup')).toBe(false);
    expect(navFor('HR').find((i) => i.href === '/designations')?.section).toBe('HR setup');
  });
});

describe('Distributors', () => {
  it('has a door in Sales & Distribution (Admin, Accountant) and one in Master data (Admin)', () => {
    const doors = (role: 'ADMIN' | 'ACCOUNTANT' | 'HR') => navGroupsFor(role).filter((g) => g.items.some((i) => i.href === '/distributors')).map((g) => g.group);
    expect(doors('ADMIN')).toEqual(['Sales & Distribution', 'Master data']);
    expect(doors('ACCOUNTANT')).toEqual(['Sales & Distribution']);
    expect(doors('HR')).toEqual([]);
    expect(activeGroupOf('ADMIN', '/distributors/d1')).toBe('Sales & Distribution');
  });

  it('lets the Accountant open a distributor and the add wizard', () => {
    expect(canOpen('ACCOUNTANT', '/distributors')).toBe(true);
    expect(canOpen('ACCOUNTANT', '/distributors/d1')).toBe(true);
    expect(canOpen('ACCOUNTANT', '/distributors/new')).toBe(true);
    expect(canOpen('ADMIN', '/distributors/new')).toBe(true);
    expect(canOpen('HR', '/distributors')).toBe(false);
  });
});

describe('canOpen', () => {
  it('lets a role open its own screens and what hangs under them', () => {
    expect(canOpen('HR', '/payroll/abc/slip')).toBe(true);
    expect(canOpen('HR', '/employees/new/staff')).toBe(true);
    expect(canOpen('HR', '/pay-bands')).toBe(true);
  });

  it('refuses a screen the role does not have, even when typed in', () => {
    expect(canOpen('HR', '/expense-claims')).toBe(false);
    expect(canOpen('ACCOUNTANT', '/employees')).toBe(false);
    for (const path of ['/payroll', '/payroll/abc/slip', '/pay-grades', '/pay-bands', '/pay-components']) expect(canOpen('ACCOUNTANT', path)).toBe(false);
    expect(canOpen('HR', '/settings')).toBe(false);
    expect(canOpen('HR', '/reports/sales')).toBe(false);
  });

  it('reads /reports/sales-dashboard as its own screen, not as /reports/sales', () => {
    expect(canOpen('ADMIN', '/reports/sales-dashboard/u1')).toBe(true);
    expect(canOpen('HR', '/reports/sales-dashboard/u1')).toBe(true);
    expect(canOpen('HR', '/reports/sales')).toBe(false);
  });

  it('gives a field role nothing', () => {
    expect(canOpen('FIELD', '/dashboard')).toBe(false);
  });
});

describe('every screen has an owner', () => {
  const appDir = fileURLToPath(new URL('../../app/(panel)', import.meta.url));
  const routes: string[] = [];
  const walk = (dir: string, path: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${path}/${name}`);
      else if (name === 'page.tsx') routes.push(path || '/');
    }
  };
  walk(appDir, '');

  // Screens every signed-in web role opens from the top-bar menu, not the rail.
  const SHARED = new Set(['/account']);
  // [id] segments stand for a record; the owner is found by the part before it.
  it.each(routes.filter((r) => !SHARED.has(r)).map((r) => r.replace(/\/\[[^\]]+\]/g, '/x')))('%s is claimed by a nav item', (route) => {
    expect(NAV_ITEMS.some((i) => isActiveItem(i, route))).toBe(true);
  });
});
