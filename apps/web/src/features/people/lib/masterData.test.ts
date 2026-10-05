import type { DesignationDto, PayBandDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_PAY_BAND_RUPEES,
  buildDesignation,
  buildDesignationUpdate,
  buildPayBand,
  buildPayBandUpdate,
  levelError,
  moneyError,
  payBandToRupees,
  unusedDesignationNames,
  unusedPayBandNames,
} from './masterData';

const g1: PayBandDto = {
  id: 'b1',
  name: 'G1',
  suggestedCtcAnnualPaise: null,
  taPerKmRatePaise: 750,
  hqDaPaise: 20_000,
  exStationDaPaise: 30_000,
  outStationDaPaise: 40_000,
};
const filled = { ...EMPTY_PAY_BAND_RUPEES, ...payBandToRupees(g1) };

describe('moneyError', () => {
  it('accepts whole rupees and up to two decimals', () => {
    expect(moneyError('25000')).toBeUndefined();
    expect(moneyError(' 7.5 ')).toBeUndefined();
    expect(moneyError('7.50')).toBeUndefined();
  });
  it('rejects blank, three decimals, negatives and text', () => {
    expect(moneyError('')).toBe('Enter an amount.');
    expect(moneyError('7.505')).toMatch(/two decimals/);
    expect(moneyError('-1')).toMatch(/two decimals/);
    expect(moneyError('abc')).toMatch(/two decimals/);
  });
  it('rejects more than ₹10 crore, and accepts exactly ₹10 crore', () => {
    expect(moneyError('100000000')).toBeUndefined();
    expect(moneyError('100000000.01')).toMatch(/crore/);
  });
});

describe('buildPayBand', () => {
  it('converts rupees to integer paise', () => {
    expect(buildPayBand({ name: 'G1', rupees: filled })).toEqual({
      ok: true,
      body: {
        name: 'G1',
        taPerKmRatePaise: 750,
        hqDaPaise: 20_000,
        exStationDaPaise: 30_000,
        outStationDaPaise: 40_000,
      },
    });
  });
  it('does not lose a paisa to floating point', () => {
    const result = buildPayBand({ name: 'G2', rupees: { ...filled, taPerKmRatePaise: '0.29' } });
    expect(result).toMatchObject({ ok: true, body: { taPerKmRatePaise: 29 } });
  });
  it('reports every bad field at once', () => {
    const result = buildPayBand({ name: '', rupees: EMPTY_PAY_BAND_RUPEES });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['exStationDaPaise', 'hqDaPaise', 'name', 'outStationDaPaise', 'taPerKmRatePaise'].sort(),
      );
    }
  });
  it('rejects a name outside the allowed grades', () => {
    expect(buildPayBand({ name: 'G9', rupees: filled })).toMatchObject({ ok: false, errors: { name: 'Choose a grade.' } });
  });
});

describe('buildPayBandUpdate', () => {
  it('sends only what changed', () => {
    expect(buildPayBandUpdate(g1, { ...filled, hqDaPaise: '250.00' })).toEqual({ ok: true, body: { hqDaPaise: 25_000 } });
  });
  it('is empty when nothing changed, so the form can just close', () => {
    expect(buildPayBandUpdate(g1, filled)).toEqual({ ok: true, body: {} });
  });
  it('treats 7.5 and 7.50 as the same value', () => {
    expect(buildPayBandUpdate(g1, { ...filled, taPerKmRatePaise: '7.5' })).toEqual({ ok: true, body: {} });
  });
  it('refuses an invalid amount', () => {
    expect(buildPayBandUpdate(g1, { ...filled, hqDaPaise: '' })).toMatchObject({
      ok: false,
      errors: { hqDaPaise: 'Enter an amount.' },
    });
  });
});

describe('unused names', () => {
  it('offers only the grades that do not exist yet', () => {
    expect(unusedPayBandNames([g1])).toEqual(['G2', 'G3']);
    expect(unusedPayBandNames([])).toEqual(['G1', 'G2', 'G3']);
  });
  it('offers only the designations that do not exist yet', () => {
    const mr: DesignationDto = { id: 'd1', name: 'MR', level: 1 };
    expect(unusedDesignationNames([mr])).toEqual(['ASM', 'RSM', 'ZSM', 'NSM']);
  });
});

describe('levelError', () => {
  it('accepts whole numbers from 1 to 99', () => {
    expect(levelError('1')).toBeUndefined();
    expect(levelError(' 99 ')).toBeUndefined();
  });
  it('rejects blank, zero, fractions, negatives and too high', () => {
    expect(levelError('')).toBe('Enter a level.');
    expect(levelError('0')).toMatch(/1 to 99/);
    expect(levelError('100')).toMatch(/1 to 99/);
    expect(levelError('1.5')).toMatch(/whole number/);
    expect(levelError('-2')).toMatch(/whole number/);
  });
});

describe('buildDesignation', () => {
  it('builds a body with a numeric level', () => {
    expect(buildDesignation({ name: 'ASM', level: ' 2 ' })).toEqual({ ok: true, body: { name: 'ASM', level: 2 } });
  });
  it('needs a name and a level', () => {
    const result = buildDesignation({ name: '', level: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['level', 'name']);
  });
});

describe('buildDesignationUpdate', () => {
  const asm: DesignationDto = { id: 'd2', name: 'ASM', level: 2 };
  it('sends the new level', () => {
    expect(buildDesignationUpdate(asm, '3')).toEqual({ ok: true, body: { level: 3 } });
  });
  it('is empty when unchanged', () => {
    expect(buildDesignationUpdate(asm, '2')).toEqual({ ok: true, body: {} });
  });
  it('refuses a bad level', () => {
    expect(buildDesignationUpdate(asm, 'x')).toMatchObject({ ok: false });
  });
});

describe('suggested CTC on a pay band', () => {
  it('is optional on create, and sent in paise when given', () => {
    expect(buildPayBand({ name: 'G1', rupees: filled })).toMatchObject({ ok: true });
    expect((buildPayBand({ name: 'G1', rupees: filled }) as { body: object }).body).not.toHaveProperty('suggestedCtcAnnualPaise');
    expect(buildPayBand({ name: 'G1', rupees: filled, suggestedCtc: '144000' })).toMatchObject({ ok: true, body: { suggestedCtcAnnualPaise: 14_400_000 } });
  });
  it('refuses nonsense', () => {
    expect(buildPayBand({ name: 'G1', rupees: filled, suggestedCtc: 'lots' })).toMatchObject({ ok: false, errors: { suggestedCtc: expect.any(String) } });
  });
  it('on edit changes only when different, and a blank clears it', () => {
    const withCtc = { ...g1, suggestedCtcAnnualPaise: 14_400_000 };
    expect(buildPayBandUpdate(withCtc, filled, '144000.00')).toEqual({ ok: true, body: {} });
    expect(buildPayBandUpdate(withCtc, filled, '180000')).toEqual({ ok: true, body: { suggestedCtcAnnualPaise: 18_000_000 } });
    expect(buildPayBandUpdate(withCtc, filled, '')).toEqual({ ok: true, body: { suggestedCtcAnnualPaise: null } });
    expect(buildPayBandUpdate(g1, filled)).toEqual({ ok: true, body: {} });
  });
});
