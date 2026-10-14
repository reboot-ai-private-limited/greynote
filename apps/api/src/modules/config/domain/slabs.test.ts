import { parseSlabs, serialiseSlabs, slabAmountPaise } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { findConfigDefinition, validateConfigValue } from './configDefinitions.js';

const PTAX = '[{"from":10000,"to":14999,"amount":110},{"from":15000,"to":19999,"amount":130},{"from":20000,"to":null,"amount":150}]';
const slabs = (text = PTAX) => {
  const p = parseSlabs(text);
  if (!p.ok) throw new Error(p.error);
  return p.slabs;
};
const rupees = (n: number) => n * 100;

describe('slabAmountPaise', () => {
  it('finds the band of a monthly salary, with `to` inclusive', () => {
    const s = slabs();
    expect(slabAmountPaise(s, rupees(10_000))).toBe(rupees(110));
    expect(slabAmountPaise(s, rupees(14_999))).toBe(rupees(110));
    expect(slabAmountPaise(s, 14_999_50)).toBe(rupees(110));
    expect(slabAmountPaise(s, rupees(15_000))).toBe(rupees(130));
    expect(slabAmountPaise(s, rupees(19_999))).toBe(rupees(130));
    expect(slabAmountPaise(s, rupees(20_000))).toBe(rupees(150));
    expect(slabAmountPaise(s, rupees(5_000_000))).toBe(rupees(150));
  });

  it('is null below the first band: that salary is not allowed', () => {
    expect(slabAmountPaise(slabs(), rupees(9_999))).toBeNull();
    expect(slabAmountPaise(slabs(), 9_999_99)).toBeNull();
  });
});

describe('parseSlabs', () => {
  const bad = (text: string) => {
    const p = parseSlabs(text);
    return p.ok ? null : p.error;
  };

  it('accepts a table that hangs together and writes it back the same', () => {
    expect(serialiseSlabs(slabs())).toBe(PTAX);
  });

  it('refuses gaps, overlaps, a closed last band, an open middle band and nonsense', () => {
    expect(bad('[]')).toMatch(/at least one/);
    expect(bad('nope')).toMatch(/not valid/);
    expect(bad('[{"from":10000,"to":14999,"amount":110},{"from":15001,"to":null,"amount":130}]')).toMatch(/must start at 15,000/);
    expect(bad('[{"from":10000,"to":14999,"amount":110},{"from":14000,"to":null,"amount":130}]')).toMatch(/must start at 15,000/);
    expect(bad('[{"from":10000,"to":14999,"amount":110}]')).toMatch(/last slab must have no upper end/);
    expect(bad('[{"from":10000,"to":null,"amount":110},{"from":20000,"to":null,"amount":150}]')).toMatch(/only the last/);
    expect(bad('[{"from":10000,"to":9000,"amount":110},{"from":9001,"to":null,"amount":1}]')).toMatch(/below the lowest/);
    expect(bad('[{"from":10000,"to":null,"amount":-1}]')).toMatch(/amount/);
    expect(bad('[{"from":"x","to":null,"amount":1}]')).toMatch(/lowest salary/);
  });
});

describe('PTAX_SLABS setting', () => {
  const def = findConfigDefinition('PTAX_SLABS')!;

  it('is seeded with the three bands and is validated as a slab table', () => {
    expect(def.type).toBe('SLAB_LIST');
    expect(validateConfigValue(def, def.default)).toEqual({ ok: true, value: def.default });
    expect(validateConfigValue(def, '[{"from":10000,"to":null,"amount":200}]')).toEqual({ ok: true, value: '[{"from":10000,"to":null,"amount":200}]' });
    expect(validateConfigValue(def, '[{"from":10000,"to":14999,"amount":110}]')).toMatchObject({ ok: false });
  });
});
