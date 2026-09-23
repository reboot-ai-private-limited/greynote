import { describe, expect, it } from 'vitest';
import { computeUserStatus } from './onboarding.js';
import type { User } from './user.entity.js';

function baseFieldUser(overrides: Partial<Omit<User, 'id'>> = {}): Omit<User, 'id'> {
  return {
    employeeCode: 'MR001',
    name: 'Jane MR',
    email: null,
    phone: null,
    mobileNumber: '9999999999',
    guardianName: null,
    dateOfBirth: new Date('1995-01-01'),
    address: { district: 'Pune', state: 'MH', pincode: '411001', country: 'India' },
    qualification: null,
    bankDetails: {
      bankName: 'SBI',
      ifsc: 'SBIN0000001',
      accountNumber: '1234567890',
      accountHolderName: 'Jane MR',
      branchName: null,
    },
    documents: [],
    status: 'pending',
    roleId: 'role-field',
    designationId: 'designation-mr',
    payBandId: 'payband-g1',
    managerId: 'manager-1',
    passwordHash: 'hash',
    dateOfJoining: new Date('2024-01-01'),
    lastLoginAt: null,
    isBlocked: false,
    blockedReason: null,
    blockedAt: null,
    unblockedBy: null,
    unblockedAt: null,
    ...overrides,
  };
}

describe('computeUserStatus', () => {
  it('is always active for non-FIELD roles, even with nothing filled in', () => {
    const admin = baseFieldUser({
      mobileNumber: null,
      dateOfBirth: null,
      address: null,
      designationId: null,
      payBandId: null,
      managerId: null,
      bankDetails: null,
    });
    expect(computeUserStatus(admin, 'ADMIN')).toBe('active');
  });

  it('is active for a FIELD user once every required field is present', () => {
    expect(computeUserStatus(baseFieldUser(), 'FIELD')).toBe('active');
  });

  it('is pending for a FIELD user missing a manager', () => {
    expect(computeUserStatus(baseFieldUser({ managerId: null }), 'FIELD')).toBe('pending');
  });

  it('is pending for a FIELD user with an incomplete address', () => {
    const user = baseFieldUser({ address: { district: 'Pune', state: '', pincode: '411001', country: 'India' } });
    expect(computeUserStatus(user, 'FIELD')).toBe('pending');
  });

  it('is pending for a FIELD user missing required bank details', () => {
    const user = baseFieldUser({
      bankDetails: { bankName: 'SBI', ifsc: '', accountNumber: '123', accountHolderName: 'Jane', branchName: null },
    });
    expect(computeUserStatus(user, 'FIELD')).toBe('pending');
  });

  it('does not require guardianName, qualification, branchName, or documents', () => {
    // baseFieldUser already leaves these unset — 'active' proves they're not in the required set.
    expect(computeUserStatus(baseFieldUser(), 'FIELD')).toBe('active');
  });

  it('never upgrades an inactive (offboarded) user back to active, even if every field is present', () => {
    const user = baseFieldUser({ status: 'inactive' });
    expect(computeUserStatus(user, 'FIELD')).toBe('inactive');
  });
});
