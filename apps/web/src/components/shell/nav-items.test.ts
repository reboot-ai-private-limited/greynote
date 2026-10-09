import { describe, expect, it } from 'vitest';
import { activeGroupOf, isActiveItem, isRouteBuilt, NAV_ITEMS, navFor, navGroupsFor, parseOpenGroups, toggleGroup, withGroupOpen } from './nav-items';

describe('navFor', () => {
  it('gives ADMIN the zones screen', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/zones');
  });

  it('hides master data from HR and Accountant', () => {
    expect(navFor('HR').map((i) => i.href)).not.toContain('/zones');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain('/zones');
  });

  it('gives Accountant payroll but not leave', () => {
    const hrefs = navFor('ACCOUNTANT').map((i) => i.href);
    expect(hrefs).toContain('/payroll');
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
  it.each(['/products', '/chemists', '/distributors', '/doctors'])('%s is an Admin-only Master data screen', (href) => {
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

describe('Expenses', () => {
  it('is built, and shown to Admin and the Accountant, not HR', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/expenses');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).toContain('/expenses');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/expenses');
    expect(isRouteBuilt('/expenses')).toBe(true);
  });
});

describe('Payroll', () => {
  it('is built, and shown to Admin and the Accountant, not HR', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/payroll');
    expect(navFor('ACCOUNTANT').map((i) => i.href)).toContain('/payroll');
    expect(navFor('HR').map((i) => i.href)).not.toContain('/payroll');
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

  it('lets the Accountant read pay grades but not see designations', () => {
    const hrefs = navFor('ACCOUNTANT').map((i) => i.href);
    expect(hrefs).toContain('/pay-grades');
    expect(hrefs).not.toContain('/designations');
  });
});

describe('Pay components', () => {
  it('lets Admin, HR and the Accountant see the formula', () => {
    for (const role of ['ADMIN', 'HR', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).toContain('/pay-components');
    expect(isRouteBuilt('/pay-components')).toBe(true);
  });
});

describe('navGroupsFor', () => {
  it('groups items under their headings, in order, dropping empty groups', () => {
    const groups = navGroupsFor('ACCOUNTANT');
    expect(groups.map((g) => g.group)).toEqual(['Home', 'Daily work', 'Money', 'Setup']);
    expect(groups.find((g) => g.group === 'Money')?.items.map((i) => i.href)).toEqual(['/payroll', '/expenses', '/expense-payouts']);
    expect(groups.find((g) => g.group === 'Daily work')?.items.map((i) => i.href)).toEqual(['/attendance']);
  });

  it('keeps Home and Daily work always open, and every other group collapsible', () => {
    const groups = navGroupsFor('ADMIN');
    expect(groups.map((g) => g.group)).toEqual(['Home', 'Daily work', 'People', 'Money', 'Reports', 'Master data', 'Setup']);
    expect(groups.filter((g) => g.alwaysOpen).map((g) => g.group)).toEqual(['Home', 'Daily work']);
  });

  it('puts every screen in exactly one group', () => {
    const grouped = navGroupsFor('ADMIN').flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(grouped.length).toBe(navFor('ADMIN').length);
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(grouped.length);
  });
});

describe('open groups', () => {
  it('finds the group holding the screen being looked at, including a record opened from it', () => {
    expect(activeGroupOf('ADMIN', '/payroll/abc/slip')).toBe('Money');
    expect(activeGroupOf('ADMIN', '/reports/sales')).toBe('Reports');
    expect(activeGroupOf('ADMIN', '/nowhere')).toBeNull();
    expect(isActiveItem({ href: '/payroll' }, '/payroll-other')).toBe(false);
  });

  it('reads what was remembered, ignoring junk and unknown names', () => {
    expect(parseOpenGroups(null)).toEqual([]);
    expect(parseOpenGroups('not json')).toEqual([]);
    expect(parseOpenGroups('["Money","Nope",3]')).toEqual(['Money']);
  });

  it('toggles a group and opens one without duplicating it', () => {
    expect(toggleGroup([], 'Money')).toEqual(['Money']);
    expect(toggleGroup(['Money'], 'Money')).toEqual([]);
    expect(withGroupOpen(['Money'], 'Money')).toEqual(['Money']);
    expect(withGroupOpen(['Money'], 'Reports')).toEqual(['Money', 'Reports']);
    expect(withGroupOpen(['Money'], null)).toEqual(['Money']);
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
  it('is for Admin only', () => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain('/orders');
    for (const role of ['HR', 'ACCOUNTANT'] as const) expect(navFor(role).map((i) => i.href)).not.toContain('/orders');
    expect(isRouteBuilt('/orders')).toBe(true);
  });
});

describe('Reports', () => {
  it('are for Admin only, in their own group', () => {
    const admin = navGroupsFor('ADMIN').find((g) => g.group === 'Reports');
    expect(admin?.items.map((i) => i.href)).toEqual(['/reports/sales-dashboard', '/reports/sales', '/reports/stock', '/reports/dcr', '/reports/ta-da', '/reports/salary']);
    for (const role of ['HR', 'ACCOUNTANT'] as const) expect(navGroupsFor(role).some((g) => g.group === 'Reports')).toBe(false);
    expect(isRouteBuilt('/reports/sales')).toBe(true);
    expect(isRouteBuilt('/reports/sales-dashboard')).toBe(true);
  });
});
