import { describe, expect, it } from 'vitest';
import { keyOf, planSpecialties } from './specialtyMigration.js';

describe('planSpecialties', () => {
  it('starts from the starter list and adds what the doctors carry that it does not have', () => {
    const plan = planSpecialties(['Cardiologist', 'Homeopath'], ['Cardiologist', 'ENT']);
    expect(plan.specialties).toEqual(['Cardiologist', 'ENT', 'Homeopath']);
    expect(plan.respell).toEqual([]);
  });

  it('merges spellings that differ in case or spacing: the starter’s spelling wins, else the most used', () => {
    const plan = planSpecialties(['ent', 'ENT ', 'Ent', 'chest  physician', 'Chest Physician', 'Chest Physician'], ['ENT']);
    expect(plan.specialties).toEqual(['Chest Physician', 'ENT']);
    expect(plan.respell).toEqual(
      expect.arrayContaining([
        { from: 'ent', to: 'ENT' },
        { from: 'ENT ', to: 'ENT' },
        { from: 'Ent', to: 'ENT' },
        { from: 'chest  physician', to: 'Chest Physician' },
      ]),
    );
    expect(plan.respell.find((r) => r.from === 'Chest Physician')).toBeUndefined();
  });

  it('ignores empty text, and an empty list gives just the starters', () => {
    expect(planSpecialties(['', '  '], ['ENT']).specialties).toEqual(['ENT']);
    expect(planSpecialties([], ['b', 'a']).specialties).toEqual(['a', 'b']);
  });

  it('keys ignore case and runs of spaces', () => {
    expect(keyOf('  Pulmonologist   / Chest ')).toBe('pulmonologist / chest');
  });
});
