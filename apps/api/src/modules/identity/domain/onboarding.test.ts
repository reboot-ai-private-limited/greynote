import { describe, expect, it } from 'vitest';
import type { EmployeeProfile } from './employeeProfile.entity.js';
import { computeUserStatus, isTopDesignation } from './onboarding.js';
import type { User } from './user.entity.js';

function baseUser(overrides: Partial<Pick<User, 'status' | 'name'>> = {}): Pick<User, 'status' | 'name'> {
  return {
    status: 'pending',
    name: 'Jane MR',
    ...overrides,
  };
}

function baseProfile(overrides: Partial<Omit<EmployeeProfile, 'id' | 'userId'>> = {}): Omit<
  EmployeeProfile,
  'id' | 'userId'
> {
  return {
    designationId: 'designation-mr',
    payBandId: 'payband-g1',
    managerId: 'manager-1',
    dateOfJoining: new Date('2024-01-01'),
    probationMonths: null,
    esiNumber: null,
    mobileNumber: '9999999999',
    hqId: null, zoneId: null, alternateMobile: null,
    guardianName: null,
    dateOfBirth: new Date('1995-01-01'),
    address: { district: 'Pune', state: 'MH', pincode: '411001', country: 'India' },
    permanentAddress: null,
    permanentSameAsPresent: false,
    qualification: null,
    qualifications: [],
    previousEmployment: [],
    bankDetails: {
      bankName: 'SBI',
      ifsc: 'SBIN0000001',
      accountNumber: '1234567890',
      accountHolderName: 'Jane MR',
      branchName: null,
    },
    documents: [],
    ...overrides,
  };
}

describe('computeUserStatus', () => {
  it('is always active for non-FIELD roles, even with no EmployeeProfile at all', () => {
    expect(computeUserStatus(baseUser(), null, 'ADMIN')).toBe('active');
  });

  it('is pending for a FIELD user with no EmployeeProfile row yet', () => {
    expect(computeUserStatus(baseUser(), null, 'FIELD')).toBe('pending');
  });

  it('is active for a FIELD user once every required field is present', () => {
    expect(computeUserStatus(baseUser(), baseProfile(), 'FIELD')).toBe('active');
  });

  it('is pending for a FIELD user missing a manager', () => {
    expect(computeUserStatus(baseUser(), baseProfile({ managerId: null }), 'FIELD')).toBe('pending');
  });

  it('is pending for a FIELD user with an incomplete address', () => {
    const profile = baseProfile({ address: { district: 'Pune', state: '', pincode: '411001', country: 'India' } });
    expect(computeUserStatus(baseUser(), profile, 'FIELD')).toBe('pending');
  });

  it('is pending for a FIELD user missing required bank details', () => {
    const profile = baseProfile({
      bankDetails: { bankName: 'SBI', ifsc: '', accountNumber: '123', accountHolderName: 'Jane', branchName: null },
    });
    expect(computeUserStatus(baseUser(), profile, 'FIELD')).toBe('pending');
  });

  it('does not require guardianName, qualification, branchName, documents, or dateOfJoining', () => {
    const profile = baseProfile({ guardianName: null, qualification: null, dateOfJoining: null });
    expect(computeUserStatus(baseUser(), profile, 'FIELD')).toBe('active');
  });

  it('never upgrades an inactive (offboarded) user back to active, even if every field is present', () => {
    expect(computeUserStatus(baseUser({ status: 'inactive' }), baseProfile(), 'FIELD')).toBe('inactive');
  });
});

describe('top designation', () => {
  const designations = [
    { id: 'mr', level: 1 },
    { id: 'zsm', level: 4 },
  ];

  it('is the highest level that exists, so a client without NSM tops out at ZSM', () => {
    expect(isTopDesignation('zsm', designations)).toBe(true);
    expect(isTopDesignation('mr', designations)).toBe(false);
    expect(isTopDesignation(null, designations)).toBe(false);
    expect(isTopDesignation('zsm', [])).toBe(false);
  });

  it('needs no manager to be active', () => {
    const profile = baseProfile({ managerId: null });
    expect(computeUserStatus(baseUser(), profile, 'FIELD')).toBe('pending');
    expect(computeUserStatus(baseUser(), profile, 'FIELD', true)).toBe('active');
  });
});
