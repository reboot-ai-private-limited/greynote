import type { LeaveTypeDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { EMPTY_LEAVE_TYPE, buildLeaveType, buildLeaveTypeUpdate, leaveTypeToDraft, paidLabel, paidTypes } from './leaveTypes';

const casual: LeaveTypeDto = { id: 't1', name: 'Casual', isPaid: true, allowsProof: false, active: true };

describe('buildLeaveType', () => {
  it('builds a normalized body', () => {
    expect(buildLeaveType({ name: '  Study   leave ', paid: 'unpaid', allowsProof: false })).toEqual({ ok: true, body: { name: 'Study leave', isPaid: false, allowsProof: false } });
    expect(buildLeaveType({ name: 'Sick', paid: 'paid', allowsProof: true })).toEqual({ ok: true, body: { name: 'Sick', isPaid: true, allowsProof: true } });
  });
  it('makes Admin choose paid or unpaid, and give a name', () => {
    const result = buildLeaveType(EMPTY_LEAVE_TYPE);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['name', 'paid']);
  });
  it('refuses a name over 100 characters', () => {
    expect(buildLeaveType({ name: 'x'.repeat(101), paid: 'paid', allowsProof: false })).toMatchObject({ ok: false });
  });
});

describe('buildLeaveTypeUpdate', () => {
  const draft = leaveTypeToDraft(casual);
  it('is empty when nothing changed', () => {
    expect(buildLeaveTypeUpdate(casual, { ...draft, name: ' Casual ' })).toEqual({ ok: true, body: {} });
  });
  it('sends a rename, and a changed paid flag so the server can refuse it when the type is in use', () => {
    expect(buildLeaveTypeUpdate(casual, { name: 'Casual leave', paid: 'paid', allowsProof: false })).toEqual({ ok: true, body: { name: 'Casual leave' } });
    expect(buildLeaveTypeUpdate(casual, { ...draft, paid: 'unpaid' })).toEqual({ ok: true, body: { isPaid: false } });
  });
  it('sends the proof switch only when it changed', () => {
    expect(buildLeaveTypeUpdate(casual, { ...draft, allowsProof: true })).toEqual({ ok: true, body: { allowsProof: true } });
    expect(buildLeaveTypeUpdate({ ...casual, allowsProof: true }, { ...draft, allowsProof: true })).toEqual({ ok: true, body: {} });
  });
});

describe('labels and the Leave Master columns', () => {
  it('says paid or unpaid', () => {
    expect(paidLabel(true)).toBe('Paid');
    expect(paidLabel(false)).toBe('Unpaid');
  });
  it('offers only active paid types as Leave Master columns', () => {
    const types = [casual, { ...casual, id: 't2', name: 'Loss of Pay', isPaid: false }, { ...casual, id: 't3', name: 'Old', active: false }];
    expect(paidTypes(types).map((t) => t.id)).toEqual(['t1']);
  });
});
