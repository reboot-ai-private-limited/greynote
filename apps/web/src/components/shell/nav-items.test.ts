import { describe, expect, it } from 'vitest';
import { isRouteBuilt, navFor, navGroupsFor } from './nav-items';

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
  it.each(['/products', '/chemists', '/distributors'])('%s is an Admin-only Master data screen', (href) => {
    expect(navFor('ADMIN').map((i) => i.href)).toContain(href);
    expect(navFor('HR').map((i) => i.href)).not.toContain(href);
    expect(navFor('ACCOUNTANT').map((i) => i.href)).not.toContain(href);
    expect(isRouteBuilt(href)).toBe(true);
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

describe('Pay Bands and Designations', () => {
  it('lets Admin and HR see both', () => {
    for (const role of ['ADMIN', 'HR'] as const) {
      const hrefs = navFor(role).map((i) => i.href);
      expect(hrefs).toContain('/pay-bands');
      expect(hrefs).toContain('/designations');
    }
  });

  it('lets the Accountant read pay bands but not see designations', () => {
    const hrefs = navFor('ACCOUNTANT').map((i) => i.href);
    expect(hrefs).toContain('/pay-bands');
    expect(hrefs).not.toContain('/designations');
  });
});

describe('navGroupsFor', () => {
  it('groups items under their headings, in order, dropping empty groups', () => {
    const groups = navGroupsFor('ACCOUNTANT');
    expect(groups.map((g) => g.group)).toEqual(['Overview', 'People', 'Operations']);
    expect(groups.find((g) => g.group === 'Operations')?.items.map((i) => i.href)).toEqual([
      '/expenses',
      '/payroll',
    ]);
  });
});
