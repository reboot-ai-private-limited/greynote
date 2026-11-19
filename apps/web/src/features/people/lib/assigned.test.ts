import { describe, expect, it } from 'vitest';
import { moreText, removeWording } from './assigned';

describe('the assigned lists on an employee page', () => {
  it('says how many are not shown, and nothing when all are', () => {
    expect(moreText(7, 5)).toBe('+2 more');
    expect(moreText(105, 5)).toBe('+100 more');
    expect(moreText(5, 5)).toBeNull();
    expect(moreText(0, 5)).toBeNull();
  });

  it('removing something a team member holds names who holds it and says it leaves the manager too', () => {
    const w = removeWording('Dr Rao', { userId: 'mr1', name: 'Rahul Roy', employeeCode: 'E1' }, { id: 'asm', name: 'Asha' });
    expect(w.title).toBe('Remove Dr Rao from Rahul Roy');
    expect(w.description).toContain('held by Rahul Roy (E1)');
    expect(w.description).toContain("leaves Asha's list too");
  });

  it('removing what the person holds themselves only changes them', () => {
    const w = removeWording('Dr Rao', { userId: 'asm', name: 'Asha', employeeCode: 'E3' }, { id: 'asm', name: 'Asha' });
    expect(w.title).toBe('Remove Dr Rao from Asha');
    expect(w.description).toContain('Nobody else changes');
  });
});
