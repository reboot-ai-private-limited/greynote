import type { PromotionPositionDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { assignMoves, buildPromotionRequest, changeSummary, clearMoves, emptyPromotionDraft, monthStartLabel, nextMonthOf, unplacedIds } from './promotion';

const draft = (over = {}) => ({ ...emptyPromotionDraft('2026-10'), ...over });
const person = (id: string, name: string) => ({ id, name, employeeCode: id.toUpperCase(), designation: null });

describe('promotion months', () => {
  it('starts from the next month, rolling over the year', () => {
    expect(emptyPromotionDraft('2026-10').effectiveFrom).toBe('2026-11');
    expect(nextMonthOf('2026-12')).toBe('2027-01');
  });
  it('is shown as the 1st', () => {
    expect(monthStartLabel('2026-11')).toBe('1 Nov 2026');
  });
});

describe('buildPromotionRequest', () => {
  it('sends only what is chosen, and the placements', () => {
    expect(buildPromotionRequest(draft({ designationId: 'd1', moves: { a: 'sam', b: '' } }))).toEqual({
      ok: true,
      body: { effectiveFrom: '2026-11', toDesignationId: 'd1', teamMoves: [{ userId: 'a', toManagerId: 'sam' }] },
    });
  });
  it('takes a CTC with no range and a reason, squashed', () => {
    const r = buildPromotionRequest(draft({ ctc: '900000', reason: '  Annual   review ', managerId: 'm1', payBandId: 'g2' }));
    expect(r).toEqual({ ok: true, body: { effectiveFrom: '2026-11', toPayBandId: 'g2', toManagerId: 'm1', ctc: { ctcAnnualPaise: 90_000_000 }, teamMoves: [], reason: 'Annual review' } });
  });
  it('refuses a bad month, a CTC that is not an amount, and a long reason', () => {
    expect(buildPromotionRequest(draft({ effectiveFrom: '' }))).toMatchObject({ ok: false, errors: { effectiveFrom: expect.any(String) } });
    expect(buildPromotionRequest(draft({ ctc: 'abc' }))).toMatchObject({ ok: false, errors: { ctc: expect.any(String) } });
    expect(buildPromotionRequest(draft({ ctc: '0' }))).toMatchObject({ ok: false, errors: { ctc: expect.any(String) } });
    expect(buildPromotionRequest(draft({ reason: 'x'.repeat(201) }))).toMatchObject({ ok: false, errors: { reason: expect.any(String) } });
  });
});

describe('handover helpers', () => {
  it('places a group, leaves the rest, and can take a placement away', () => {
    const moves = assignMoves({ a: 'x' }, ['b', 'c'], 'sam');
    expect(moves).toEqual({ a: 'x', b: 'sam', c: 'sam' });
    expect(assignMoves(moves, ['a'], 'lee')).toEqual({ a: 'lee', b: 'sam', c: 'sam' });
    expect(clearMoves(moves, ['b'])).toEqual({ a: 'x', c: 'sam' });
  });
  it('lists who is not placed yet', () => {
    expect(unplacedIds(['a', 'b', 'c'], { a: 'x', c: '' })).toEqual(['b', 'c']);
    expect(unplacedIds([], {})).toEqual([]);
  });
});

describe('changeSummary', () => {
  const pos = (designation: PromotionPositionDto['designation'], grade: string | null, manager: string | null): PromotionPositionDto => ({
    designation,
    payBand: grade ? { id: grade, name: grade.toUpperCase() } : null,
    manager: manager ? person(manager, manager) : null,
  });
  it('names each change and nothing else', () => {
    expect(changeSummary(pos('ASM', 'g1', 'rsm'), pos('ZSM', 'g2', 'nsm'))).toEqual(['Designation ASM → ZSM', 'Grade G1 → G2', 'Manager rsm → nsm']);
    expect(changeSummary(pos('ASM', 'g1', 'rsm'), pos('ASM', 'g1', 'rsm'))).toEqual([]);
    expect(changeSummary(pos('ASM', 'g1', 'rsm'), pos('ZSM', 'g1', 'rsm'))).toEqual(['Designation ASM → ZSM']);
  });
});
