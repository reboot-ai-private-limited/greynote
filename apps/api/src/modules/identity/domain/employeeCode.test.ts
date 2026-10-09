import { describe, expect, it } from 'vitest';
import { formatEmployeeCode, parseEmployeeCode } from './employeeCode.js';

describe('employee code', () => {
  it('pads to four digits and grows past 9999', () => {
    expect(formatEmployeeCode(1)).toBe('GRN0001');
    expect(formatEmployeeCode(42)).toBe('GRN0042');
    expect(formatEmployeeCode(10000)).toBe('GRN10000');
  });

  it('reads only GRN codes', () => {
    expect(parseEmployeeCode('GRN0042')).toBe(42);
    expect(parseEmployeeCode('EMP-7')).toBeNull();
    expect(parseEmployeeCode('GRN')).toBeNull();
  });
});
