import { describe, expect, it } from 'vitest';
import { navFor } from './nav-items';

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
