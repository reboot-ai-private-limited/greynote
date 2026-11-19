import { describe, expect, it } from 'vitest';
import { moreText, removeNote, removeWording, resultSummary, reviewNote } from './assigned';

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

  it('the review says what assigning does to who holds it now', () => {
    const rahul = { userId: 'mr1', name: 'Rahul Roy', employeeCode: 'E1' };
    expect(reviewNote('doctors', [], 'x')).toMatchObject({ tone: 'free' });
    expect(reviewNote('doctors', [rahul], 'x')).toEqual({ text: 'Moves from Rahul Roy', tone: 'moves' });
    expect(reviewNote('chemists', [rahul], 'x')).toEqual({ text: 'Adds to Rahul Roy, who keep it', tone: 'adds' });
    expect(reviewNote('chemists', [rahul], 'mr1')).toMatchObject({ tone: 'already' });
  });

  it('summarises a bulk assign', () => {
    expect(resultSummary('doctors', [{ outcome: 'ASSIGNED' }, { outcome: 'MOVED' }, { outcome: 'SKIPPED' }, { outcome: 'ALREADY' }])).toBe('2 doctors assigned, 1 already held, 1 skipped.');
    expect(resultSummary('chemists', [{ outcome: 'ASSIGNED' }])).toBe('1 chemist assigned.');
    expect(resultSummary('doctors', [{ outcome: 'REMOVED' }, { outcome: 'REMOVED' }])).toBe('2 doctors removed.');
    expect(resultSummary('doctors', [])).toBe('Nothing changed.');
  });

  it('says what unticking a held record leaves behind', () => {
    const rahul = { userId: 'mr1', name: 'Rahul Roy', employeeCode: 'E1' };
    const ben = { userId: 'mr2', name: 'Ben', employeeCode: 'E2' };
    expect(removeNote('doctors', [rahul], 'mr1')).toBe('Nobody will hold it until it is assigned again');
    expect(removeNote('chemists', [rahul, ben], 'mr1')).toBe('Ben keeps it');
    expect(removeNote('chemists', [rahul], 'mr1')).toBe('Nobody will hold it');
  });
});
