import type { DesignationDto, PayBandDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_PAY_BAND_RUPEES,
  buildDesignation,
  buildPayBand,
  buildPayBandUpdate,
  moneyError,
  payBandToRupees,
  unusedDesignationNames,
} from './masterData';

const g1: PayBandDto = {
  id: 'b1',
  name: 'G1',
  ctcMinAnnualPaise: 14_400_000,
  ctcMaxAnnualPaise: 30_000_000,
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
  it('converts rupees to integer paise and carries the range', () => {
    expect(buildPayBand({ name: 'G1', rupees: filled })).toEqual({
      ok: true,
      body: {
        name: 'G1',
        ctcMinAnnualPaise: 14_400_000,
        ctcMaxAnnualPaise: 30_000_000,
        taPerKmRatePaise: 750,
        hqDaPaise: 20_000,
        exStationDaPaise: 30_000,
        outStationDaPaise: 40_000,
      },
    });
  });
  it('does not lose a paisa to floating point', () => {
    expect(buildPayBand({ name: 'G2', rupees: { ...filled, taPerKmRatePaise: '0.29' } })).toMatchObject({ ok: true, body: { taPerKmRatePaise: 29 } });
  });
  it('takes any name, tidied up — not only G1 to G3', () => {
    expect(buildPayBand({ name: '  Senior   Exec ', rupees: filled })).toMatchObject({ ok: true, body: { name: 'Senior Exec' } });
    expect(buildPayBand({ name: 'G11', rupees: filled })).toMatchObject({ ok: true });
  });
  it('refuses a blank, too long or already used name (ignoring case)', () => {
    expect(buildPayBand({ name: ' ', rupees: filled })).toMatchObject({ ok: false, errors: { name: expect.stringMatching(/Enter a name/) } });
    expect(buildPayBand({ name: 'x'.repeat(21), rupees: filled })).toMatchObject({ ok: false, errors: { name: expect.stringMatching(/20/) } });
    expect(buildPayBand({ name: 'g1', rupees: filled }, [g1])).toMatchObject({ ok: false, errors: { name: expect.stringMatching(/already exists/) } });
  });
  it('reports every bad field at once', () => {
    const result = buildPayBand({ name: '', rupees: EMPTY_PAY_BAND_RUPEES });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['ctcMaxAnnualPaise', 'ctcMinAnnualPaise', 'exStationDaPaise', 'hqDaPaise', 'name', 'outStationDaPaise', 'taPerKmRatePaise'].sort(),
      );
    }
  });
  it('needs a range that is above zero with the minimum not above the maximum; equal ends are fine', () => {
    expect(buildPayBand({ name: 'A', rupees: { ...filled, ctcMinAnnualPaise: '0' } })).toMatchObject({ ok: false, errors: { ctcMinAnnualPaise: expect.stringMatching(/more than zero/) } });
    expect(buildPayBand({ name: 'A', rupees: { ...filled, ctcMinAnnualPaise: '400000', ctcMaxAnnualPaise: '300000' } })).toMatchObject({ ok: false, errors: { ctcMaxAnnualPaise: expect.stringMatching(/below the minimum/) } });
    expect(buildPayBand({ name: 'A', rupees: { ...filled, ctcMinAnnualPaise: '300000', ctcMaxAnnualPaise: '300000' } })).toMatchObject({ ok: true });
  });
});

describe('buildPayBandUpdate', () => {
  const draft = (over: Partial<typeof filled> = {}, name = 'G1') => ({ name, rupees: { ...filled, ...over } });
  it('sends only what changed', () => {
    expect(buildPayBandUpdate(g1, draft({ hqDaPaise: '250.00' }))).toEqual({ ok: true, body: { hqDaPaise: 25_000 } });
    expect(buildPayBandUpdate(g1, draft({ ctcMaxAnnualPaise: '350000' }))).toEqual({ ok: true, body: { ctcMaxAnnualPaise: 35_000_000 } });
  });
  it('is empty when nothing changed, so the form can just close', () => {
    expect(buildPayBandUpdate(g1, draft())).toEqual({ ok: true, body: {} });
  });
  it('treats 7.5 and 7.50 as the same value', () => {
    expect(buildPayBandUpdate(g1, draft({ taPerKmRatePaise: '7.5' }))).toEqual({ ok: true, body: {} });
  });
  it('can rename, but not onto another grade, and keeping its own name is fine', () => {
    const g2: PayBandDto = { ...g1, id: 'b2', name: 'G2' };
    expect(buildPayBandUpdate(g1, draft({}, 'Associate'), [g1, g2])).toEqual({ ok: true, body: { name: 'Associate' } });
    expect(buildPayBandUpdate(g1, draft({}, 'g2'), [g1, g2])).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(buildPayBandUpdate(g1, draft({}, 'G1'), [g1, g2])).toEqual({ ok: true, body: {} });
    expect(buildPayBandUpdate(g1, draft({}, 'g1'), [g1, g2])).toEqual({ ok: true, body: { name: 'g1' } }); // a case fix of its own name
  });
  it('refuses an invalid amount or a range turned upside down', () => {
    expect(buildPayBandUpdate(g1, draft({ hqDaPaise: '' }))).toMatchObject({ ok: false, errors: { hqDaPaise: 'Enter an amount.' } });
    expect(buildPayBandUpdate(g1, draft({ ctcMinAnnualPaise: '999999' }))).toMatchObject({ ok: false });
  });
});

describe('unused designations', () => {
  it('offers only the designations that do not exist yet', () => {
    const mr: DesignationDto = { id: 'd1', name: 'MR', level: 1 };
    expect(unusedDesignationNames([mr])).toEqual(['ASM', 'RSM', 'ZSM', 'NSM']);
  });
});

describe('buildDesignation', () => {
  it('sends only the name — the level follows from it on the server', () => {
    expect(buildDesignation({ name: 'ASM' })).toEqual({ ok: true, body: { name: 'ASM' } });
  });
  it('needs one of the five designations', () => {
    expect(buildDesignation({ name: '' })).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(buildDesignation({ name: 'CEO' })).toMatchObject({ ok: false });
  });
});
