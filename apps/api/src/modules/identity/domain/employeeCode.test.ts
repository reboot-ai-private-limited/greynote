import { describe, expect, it } from 'vitest';
import { formatEmployeeCode, parseEmployeeCode } from './employeeCode.js';

describe('employee code', () => {
  it('has no padding and grows past 999', () => {
    expect(formatEmployeeCode(101)).toBe('GH101');
    expect(formatEmployeeCode(102)).toBe('GH102');
    expect(formatEmployeeCode(1000)).toBe('GH1000');
  });

  it('reads only GH codes', () => {
    expect(parseEmployeeCode('GH142')).toBe(142);
    expect(parseEmployeeCode('GRN0042')).toBeNull();
    expect(parseEmployeeCode('EMP-7')).toBeNull();
    expect(parseEmployeeCode('GH')).toBeNull();
  });
});
