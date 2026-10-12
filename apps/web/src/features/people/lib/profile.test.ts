import type { UserDetailDto } from '@greynote/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ADDRESS,
  basicToDraft,
  bankToDraft,
  buildAddress,
  buildBank,
  buildBasic,
  buildWork,
  maskAccount,
  missingForActive,
  toDateInput,
  workToDraft,
} from './profile';

const TODAY = '2026-10-03';

const complete: UserDetailDto = {
  id: 'u1',
  employeeCode: 'MR001',
  name: 'Asha Rao',
  email: null,
  phone: null,
  role: 'FIELD',
  status: 'active',
  isBlocked: false,
  lastLoginAt: null,
  currentBlock: null, blockHistory: [],
  profile: {
    designationId: 'd1',
    payBandId: 'b1',
    managerId: 'm1',
    dateOfJoining: '2024-04-01T00:00:00.000Z',
    probationMonths: null,
    esiNumber: null,
    mobileNumber: '9830012345',
    hqId: null, zoneId: null, alternateMobile: null,
    guardianName: null,
    dateOfBirth: '1995-08-20T00:00:00.000Z',
    address: { district: 'Darjeeling', state: 'West Bengal', pincode: '734001', country: 'India' },
    permanentAddress: null,
    permanentSameAsPresent: false,
    qualification: null,
    qualifications: [],
    previousEmployment: [],
    bankDetails: { bankName: 'SBI', ifsc: 'SBIN0001234', accountNumber: '123456789012', accountHolderName: 'Asha Rao', branchName: null },
    documents: [],
  },
};
const fresh: UserDetailDto = { ...complete, status: 'pending', profile: null };

describe('toDateInput', () => {
  it('cuts an ISO timestamp to the date, with no timezone shift', () => {
    expect(toDateInput('1995-08-20T00:00:00.000Z')).toBe('1995-08-20');
    expect(toDateInput(null)).toBe('');
  });
});

describe('buildBasic', () => {
  const draft = basicToDraft(complete);
  it('is empty when nothing changed, so the form just closes', () => {
    expect(buildBasic(complete, draft, TODAY)).toEqual({ ok: true, body: {} });
  });
  it('sends only the changed fields', () => {
    expect(buildBasic(complete, { ...draft, name: '  Asha   R. Rao ', qualification: 'B.Pharm' }, TODAY)).toEqual({
      ok: true,
      body: { basicDetails: { name: 'Asha R. Rao', qualification: 'B.Pharm' } },
    });
  });
  it('needs name, mobile and date of birth for a new employee', () => {
    const result = buildBasic(fresh, { ...basicToDraft(fresh), name: '' }, TODAY);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['dateOfBirth', 'mobileNumber', 'name']);
  });
  it('rejects a date of birth that is today, in the future, or not a real date', () => {
    expect(buildBasic(complete, { ...draft, dateOfBirth: TODAY }, TODAY)).toMatchObject({ ok: false });
    expect(buildBasic(complete, { ...draft, dateOfBirth: '2030-01-01' }, TODAY)).toMatchObject({ ok: false });
    expect(buildBasic(complete, { ...draft, dateOfBirth: '2001-02-30' }, TODAY)).toMatchObject({
      ok: false,
      errors: { dateOfBirth: 'Enter a real date.' },
    });
  });
  it('rejects a malformed mobile number', () => {
    expect(buildBasic(complete, { ...draft, mobileNumber: '12ab' }, TODAY)).toMatchObject({ ok: false });
    expect(buildBasic(complete, { ...draft, mobileNumber: '+91 98300 12345' }, TODAY)).toMatchObject({ ok: true });
  });
  it('sends null for an optional field that was emptied, so the server clears it', () => {
    const filled = {
      ...complete,
      profile: { ...complete.profile!, guardianName: 'R. Rao', qualification: 'B.Pharm' },
    };
    expect(buildBasic(filled, { ...basicToDraft(filled), guardianName: '  ', qualification: '', dateOfJoining: '' }, TODAY)).toEqual({
      ok: true,
      body: { basicDetails: { guardianName: null, qualification: null, dateOfJoining: null } },
    });
  });
  it('sends nothing for an optional field that was empty and still is', () => {
    expect(buildBasic(complete, { ...draft, guardianName: ' ' }, TODAY)).toEqual({ ok: true, body: {} });
  });
  it('still refuses to empty a required field', () => {
    expect(buildBasic(complete, { ...draft, mobileNumber: '' }, TODAY)).toMatchObject({ ok: false });
    expect(buildBasic(complete, { ...draft, dateOfBirth: '' }, TODAY)).toMatchObject({ ok: false });
  });
});

describe('buildAddress', () => {
  const draft = { ...complete.profile!.address! };
  it('sends the whole address when anything changed', () => {
    expect(buildAddress(complete.profile!.address, { ...draft, district: ' Kalimpong ' })).toEqual({
      ok: true,
      body: { basicDetails: { address: { ...draft, district: 'Kalimpong' } } },
    });
  });
  it('is empty when unchanged', () => {
    expect(buildAddress(complete.profile!.address, draft)).toEqual({ ok: true, body: {} });
  });
  it('requires every part', () => {
    const result = buildAddress(null, { ...EMPTY_ADDRESS });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['district', 'pincode', 'state']);
  });
  it('checks the pincode only for India', () => {
    expect(buildAddress(null, { ...draft, pincode: '7340' })).toMatchObject({ ok: false });
    expect(buildAddress(null, { ...draft, pincode: '012345' })).toMatchObject({ ok: false });
    expect(buildAddress(null, { ...draft, country: 'Nepal', pincode: '44600' })).toMatchObject({ ok: true });
  });
});

describe('buildBank', () => {
  const draft = bankToDraft(complete.profile!.bankDetails);
  it('is empty when unchanged', () => {
    expect(buildBank(complete.profile!.bankDetails, draft)).toEqual({ ok: true, body: {} });
  });
  it('uppercases the IFSC and strips spaces from the account number', () => {
    expect(buildBank(null, { ...draft, ifsc: 'sbin0001234', accountNumber: '1234 5678 9012' })).toEqual({
      ok: true,
      body: { bankDetails: { bankName: 'SBI', ifsc: 'SBIN0001234', accountNumber: '123456789012', accountHolderName: 'Asha Rao' } },
    });
  });
  it('sends the branch only when given', () => {
    expect(buildBank(null, { ...draft, branchName: ' Siliguri ' })).toMatchObject({ body: { bankDetails: { branchName: 'Siliguri' } } });
  });
  it('rejects a bad IFSC and a bad account number', () => {
    const result = buildBank(null, { ...draft, ifsc: 'SBIN1001234', accountNumber: '12ab' });
    expect(result).toMatchObject({ ok: false, errors: { ifsc: expect.stringMatching(/IFSC/), accountNumber: 'Use 6 to 20 digits.' } });
  });
  it('requires the four mandatory fields but not the branch', () => {
    const result = buildBank(null, bankToDraft(null));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['accountHolderName', 'accountNumber', 'bankName', 'ifsc']);
  });
});

describe('maskAccount', () => {
  it('shows only the last four digits', () => {
    expect(maskAccount('123456789012')).toBe('••••9012');
    expect(maskAccount('123')).toBe('••••');
  });
});

describe('buildWork', () => {
  const draft = workToDraft(complete.profile);
  it('sends only the field that changed', () => {
    expect(buildWork(complete.profile, { ...draft, payBandId: 'b2' }, 'u1')).toEqual({ ok: true, body: { payBandId: 'b2' } });
  });
  it('is empty when unchanged', () => {
    expect(buildWork(complete.profile, draft, 'u1')).toEqual({ ok: true, body: {} });
  });
  it('does not send an empty choice', () => {
    expect(buildWork(null, workToDraft(null), 'u1')).toEqual({ ok: true, body: {} });
  });
  it('refuses to make an employee their own manager', () => {
    expect(buildWork(complete.profile, { ...draft, managerId: 'u1' }, 'u1')).toMatchObject({
      ok: false,
      errors: { managerId: 'An employee cannot report to themselves.' },
    });
  });
});

describe('missingForActive', () => {
  it('lists everything for a brand-new field employee', () => {
    expect(missingForActive(fresh)).toEqual([
      'Mobile number',
      'Date of birth',
      'Address',
      'Designation',
      'Pay grade',
      'Manager',
      'Bank details',
    ]);
  });
  it('is empty for a complete profile', () => {
    expect(missingForActive(complete)).toEqual([]);
  });
  it('spots a half-filled address and half-filled bank details', () => {
    const half = {
      ...complete,
      profile: { ...complete.profile!, address: { ...complete.profile!.address!, pincode: '' }, bankDetails: { ...complete.profile!.bankDetails!, ifsc: '' } },
    };
    expect(missingForActive(half)).toEqual(['Address', 'Bank details']);
  });
  it('is empty for a non-field role and for an inactive employee', () => {
    expect(missingForActive({ ...fresh, role: 'HR' })).toEqual([]);
    expect(missingForActive({ ...fresh, status: 'inactive' })).toEqual([]);
  });
});

describe('probation months', () => {
  const user = complete;
  it('empty means the system default and sends nothing when unchanged', () => {
    expect(basicToDraft(user).probationMonths).toBe('');
    expect(buildBasic(user, basicToDraft(user), TODAY)).toEqual({ ok: true, body: {} });
  });

  it('a number is sent as a number, 0 included, and emptying it sends null', () => {
    expect(buildBasic(user, { ...basicToDraft(user), probationMonths: '3' }, TODAY)).toEqual({ ok: true, body: { basicDetails: { probationMonths: 3 } } });
    expect(buildBasic(user, { ...basicToDraft(user), probationMonths: '0' }, TODAY)).toEqual({ ok: true, body: { basicDetails: { probationMonths: 0 } } });
    const set = { ...user, profile: { ...user.profile!, probationMonths: 6 } };
    expect(buildBasic(set, { ...basicToDraft(set), probationMonths: '' }, TODAY)).toEqual({ ok: true, body: { basicDetails: { probationMonths: null } } });
  });

  it('refuses anything but whole months from 0 to 36', () => {
    for (const bad of ['-1', '1.5', 'six', '37']) {
      expect(buildBasic(user, { ...basicToDraft(user), probationMonths: bad }, TODAY)).toMatchObject({ ok: false });
    }
  });
});

describe('ESI number', () => {
  it('is optional, exactly 17 digits, sent when changed and null when emptied', () => {
    expect(basicToDraft(complete).esiNumber).toBe('');
    expect(buildBasic(complete, { ...basicToDraft(complete), esiNumber: ' 12345678901234567 ' }, TODAY)).toEqual({
      ok: true,
      body: { basicDetails: { esiNumber: '12345678901234567' } },
    });
    const set = { ...complete, profile: { ...complete.profile!, esiNumber: '12345678901234567' } };
    expect(buildBasic(set, basicToDraft(set), TODAY)).toEqual({ ok: true, body: {} });
    expect(buildBasic(set, { ...basicToDraft(set), esiNumber: '' }, TODAY)).toEqual({ ok: true, body: { basicDetails: { esiNumber: null } } });
  });

  it('refuses anything that is not 17 digits', () => {
    for (const bad of ['1234', '1234567890123456', '123456789012345678', '1234567890123456x']) {
      expect(buildBasic(complete, { ...basicToDraft(complete), esiNumber: bad }, TODAY)).toMatchObject({ ok: false });
    }
  });
});
