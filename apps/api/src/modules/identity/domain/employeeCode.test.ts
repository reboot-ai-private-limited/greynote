import { describe, expect, it } from 'vitest';
import { formatEmployeeCode, parseEmployeeCode } from './employeeCode.js';

describe('employee code', () => {
  it('pads to three digits and grows past 999', () => {
    expect(formatEmployeeCode(1)).toBe('GHC001');
    expect(formatEmployeeCode(42)).toBe('GHC042');
    expect(formatEmployeeCode(999)).toBe('GHC999');
    expect(formatEmployeeCode(1000)).toBe('GHC1000');
  });

  it('reads only GHC codes', () => {
    expect(parseEmployeeCode('GHC142')).toBe(142);
    expect(parseEmployeeCode('GHC007')).toBe(7);
    expect(parseEmployeeCode('GH142')).toBeNull();
    expect(parseEmployeeCode('GRN0042')).toBeNull();
    expect(parseEmployeeCode('EMP-7')).toBeNull();
    expect(parseEmployeeCode('GHC')).toBeNull();
  });
});
