import { describe, expect, it } from 'vitest';
import { exportFilename, slug } from './exportFilename';

const rahul = { name: 'Rahul Roy', designation: 'MR', employeeCode: 'EMP03' };

describe('slug', () => {
  it('folds accents and drops apostrophes and punctuation', () => {
    expect(slug("Zoë D'Souza")).toBe('zoe-d-souza');
    expect(slug('  Dr. A.K. Sharma ')).toBe('dr-a-k-sharma');
  });
  it('is empty for a name with no Latin letters', () => expect(slug('राहुल')).toBe(''));
});

describe('exportFilename', () => {
  it('names the person, designation, what, period and code', () => {
    expect(exportFilename(rahul, 'monthly-plan', '2026-11')).toBe('rahul-roy-mr-monthly-plan-2026-11-emp03.csv');
    expect(exportFilename(rahul, 'dcr', '2026-02-12')).toBe('rahul-roy-mr-dcr-2026-02-12-emp03.csv');
    expect(exportFilename({ ...rahul, designation: 'ASM' }, 'dcr', '2026-27')).toBe('rahul-roy-asm-dcr-2026-27-emp03.csv');
  });
  it('has no period for a list', () => expect(exportFilename(rahul, 'doctors')).toBe('rahul-roy-mr-doctors-emp03.csv'));
  it('leaves out a missing designation', () => expect(exportFilename({ ...rahul, designation: null }, 'doctors')).toBe('rahul-roy-doctors-emp03.csv'));
  it('falls back to the code when the name has no Latin letters', () => expect(exportFilename({ name: 'राहुल', employeeCode: 'EMP03' }, 'doctors')).toBe('emp03-doctors.csv'));
  it('reads unknown for an unknown owner', () => expect(exportFilename({}, 'dcr', '2026-02-12')).toBe('unknown-dcr-2026-02-12.csv'));
});
