import type { UserDetailDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import { neighbour, requiredProgress, setupSteps, startStep } from './setup';

const base: UserDetailDto = {
  id: 'u1', employeeCode: 'MR001', name: 'Asha Rao', email: null, phone: null, role: 'FIELD', status: 'pending', isBlocked: false, lastLoginAt: null, currentBlock: null, blockHistory: [], profile: null,
};
const profile = (over: Partial<NonNullable<UserDetailDto['profile']>> = {}): NonNullable<UserDetailDto['profile']> => ({
  designationId: null, payBandId: null, managerId: null, dateOfJoining: null, probationMonths: null, esiNumber: null, mobileNumber: null, hqId: null, zoneId: null, alternateMobile: null, guardianName: null, dateOfBirth: null,
  address: null, permanentAddress: null, permanentSameAsPresent: false, qualification: null, qualifications: [], previousEmployment: [], bankDetails: null, documents: [], ...over,
});
const keys = (steps: ReturnType<typeof setupSteps>) => steps.map((s) => [s.key, s.done]);

describe('setupSteps', () => {
  it('a new employee has nothing done but the name, which is not enough for the personal step', () => {
    expect(keys(setupSteps(base))).toEqual([['personal', false], ['address', false], ['work', false], ['bank', false], ['compensation', null], ['documents', false]]);
  });
  it('marks each step done from the profile', () => {
    const user = {
      ...base,
      profile: profile({
        mobileNumber: '9830012345', dateOfBirth: '1995-08-20T00:00:00Z',
        address: { district: 'Darjeeling', state: 'West Bengal', pincode: '734001', country: 'India' },
        designationId: 'd', payBandId: 'b', managerId: 'm',
        bankDetails: { bankName: 'SBI', ifsc: 'SBIN0001234', accountNumber: '1', accountHolderName: 'Asha', branchName: null },
      }),
    };
    expect(keys(setupSteps(user))).toEqual([['personal', true], ['address', true], ['work', true], ['bank', true], ['compensation', null], ['documents', false]]);
  });
  it('a half-filled step is not done', () => {
    expect(setupSteps({ ...base, profile: profile({ designationId: 'd', payBandId: 'b' }) }).find((s) => s.key === 'work')!.done).toBe(false);
    expect(setupSteps({ ...base, profile: profile({ address: { district: 'x', state: '', pincode: '1', country: 'India' } }) }).find((s) => s.key === 'address')!.done).toBe(false);
  });
});

describe('startStep', () => {
  it('honours a real step in the address, ignores a made-up one', () => {
    expect(startStep(base, 'bank')).toBe('bank');
    expect(startStep(base, 'nonsense')).toBe('personal');
  });
  it('otherwise starts at the first required step still open', () => {
    const user = { ...base, profile: profile({ mobileNumber: '9830012345', dateOfBirth: '1995-08-20T00:00:00Z' }) };
    expect(startStep(user, undefined)).toBe('address');
  });
});

describe('neighbour and progress', () => {
  it('walks the steps and stops at the ends', () => {
    expect(neighbour('personal', -1)).toBeNull();
    expect(neighbour('personal', 1)).toBe('address');
    expect(neighbour('documents', 1)).toBeNull();
    expect(neighbour('documents', -1)).toBe('compensation');
  });
  it('counts only the required steps', () => {
    expect(requiredProgress(setupSteps(base))).toEqual({ done: 0, total: 4 });
  });
});
