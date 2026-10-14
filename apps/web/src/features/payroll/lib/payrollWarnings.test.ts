import { describe, expect, it } from 'vitest';
import { employeesHref, missingChipLabel, warningLinks } from './payrollWarnings';

const person = (userId: string) => ({ userId, name: userId, employeeCode: userId });

describe('warningLinks', () => {
  it('says nothing when nobody is missing a number, or while loading', () => {
    expect(warningLinks(undefined)).toEqual([]);
    expect(warningLinks({ esiCeilingRupees: 21000, esiMissing: [], epfMissing: [] })).toEqual([]);
  });

  it('names the ceiling and links to exactly the people', () => {
    const links = warningLinks({ esiCeilingRupees: 21000, esiMissing: [person('a'), person('b'), person('c')], epfMissing: [person('a')] });
    expect(links).toEqual([
      { key: 'esi', text: "3 employees with a salary of ₹21,000 or less don't have an ESI number", href: '/employees?ids=a,b,c&missing=esi' },
      { key: 'epf', text: "1 employee doesn't have an EPF number", href: '/employees?ids=a&missing=epf' },
    ]);
  });
});

describe('employeesHref / missingChipLabel', () => {
  it('builds the filtered list link and its chip', () => {
    expect(employeesHref('epf', ['x', 'y'])).toBe('/employees?ids=x,y&missing=epf');
    expect(missingChipLabel('esi', 3)).toBe('Missing ESI number · 3');
    expect(missingChipLabel('epf', 1)).toBe('Missing EPF number · 1');
    expect(missingChipLabel('', 1)).toBe('');
  });
});
