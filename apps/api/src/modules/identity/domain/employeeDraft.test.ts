import { describe, expect, it } from 'vitest';
import { draftGaps, type EmployeeDraftData } from './employeeDraft.entity.js';

const address = { line1: '12 Park St', district: 'Kolkata', state: 'West Bengal', pincode: '700016' };

const complete: EmployeeDraftData = {
  personal: { name: 'A', mobileNumber: '9830012345', guardianName: 'B', dateOfBirth: '1990-01-01' },
  address: { present: address, permanentSameAsPresent: true },
  bank: { bankName: 'SBI', accountNumber: '1', accountHolderName: 'A', ifsc: 'SBIN0000001', branchName: 'Park St' },
  work: { designationId: 'd', hqId: 'h', managerId: 'm' },
  compensation: { payBandId: 'g1' },
};

describe('draftGaps', () => {
  it('is empty for a complete draft; qualifications, experience and CTC amount are optional', () => {
    expect(draftGaps(complete)).toEqual([]);
  });

  it('lists everything for an empty draft', () => {
    const gaps = draftGaps({});
    expect(gaps.map((g) => g.step)).toEqual(expect.arrayContaining(['personal', 'address', 'bank', 'work', 'compensation']));
    expect(gaps).toContainEqual({ step: 'address', field: 'permanent.pincode' });
  });

  it('wants the permanent address unless it is the same as present', () => {
    const data = { ...complete, address: { present: address, permanentSameAsPresent: false } };
    expect(draftGaps(data)).toContainEqual({ step: 'address', field: 'permanent.line1' });
  });

  it('does not need a manager', () => {
    expect(draftGaps({ ...complete, work: { designationId: 'd', hqId: 'h' } })).toEqual([]);
  });

  it('refuses a half-filled qualification or job', () => {
    const data = { ...complete, qualifications: [{ degree: 'BSc' }], experience: [{ companyName: 'X' }] };
    expect(draftGaps(data)).toEqual([
      { step: 'qualifications', field: '0.institute' },
      { step: 'qualifications', field: '0.yearOfPassing' },
      { step: 'experience', field: '0.joiningDate' },
    ]);
  });
});
