import { describe, expect, it } from 'vitest';
import { navFor, navGroupsFor } from './nav-items';

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
