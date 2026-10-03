import type { UpdateUserDto, UserAddressDto, UserBankDetailsDto, UserDetailDto } from '@greynote/contracts';
import { fail, type BuildResult } from './masterData';

/**
 * Employee profile drafts → PATCH bodies, one per section: the API's PATCH is incremental, so
 * each section of the screen saves on its own. Pure, so the rules are tested without a browser.
 */

const squash = (s: string) => s.trim().replace(/\s+/g, ' ');

/** `2000-01-31T00:00:00.000Z` → `2000-01-31`, the value of a date input. */
export function toDateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const PHONE = /^\+?[\d\s-]{7,15}$/;

// ── Basic details ──────────────────────────────────────────────────────────────────────────

export interface BasicDraft {
  name: string;
  mobileNumber: string;
  guardianName: string;
  dateOfBirth: string;
  dateOfJoining: string;
  qualification: string;
}

export function basicToDraft(user: UserDetailDto): BasicDraft {
  const p = user.profile;
  return {
    name: user.name,
    mobileNumber: p?.mobileNumber ?? '',
    guardianName: p?.guardianName ?? '',
    dateOfBirth: toDateInput(p?.dateOfBirth),
    dateOfJoining: toDateInput(p?.dateOfJoining),
    qualification: p?.qualification ?? '',
  };
}

export function buildBasic(user: UserDetailDto, draft: BasicDraft, today: string): BuildResult<UpdateUserDto> {
  const name = squash(draft.name);
  const mobile = draft.mobileNumber.trim();
  const errors = {
    name: name === '' ? 'Enter a name.' : undefined,
    mobileNumber: mobile === '' ? 'Enter a mobile number.' : PHONE.test(mobile) ? undefined : 'Use 7 to 15 digits, e.g. 98300 12345.',
    dateOfBirth: !draft.dateOfBirth
      ? 'Enter the date of birth.'
      : !isRealDate(draft.dateOfBirth)
        ? 'Enter a real date.'
        : draft.dateOfBirth >= today
          ? 'The date of birth must be in the past.'
          : undefined,
    dateOfJoining: draft.dateOfJoining && !isRealDate(draft.dateOfJoining) ? 'Enter a real date.' : undefined,
  };
  if (Object.values(errors).some(Boolean)) return fail(errors);

  // Only what changed: a rename must not re-send (and race on) the date of birth. The three optional
  // fields send `null` when emptied; name, mobile and date of birth are required and cannot be.
  const before = basicToDraft(user);
  const guardian = squash(draft.guardianName);
  const qualification = squash(draft.qualification);
  const basicDetails: NonNullable<UpdateUserDto['basicDetails']> = {
    ...(name !== before.name && { name }),
    ...(mobile !== before.mobileNumber && { mobileNumber: mobile }),
    ...(guardian !== before.guardianName && { guardianName: guardian === '' ? null : guardian }),
    ...(draft.dateOfBirth !== before.dateOfBirth && { dateOfBirth: draft.dateOfBirth }),
    ...(draft.dateOfJoining !== before.dateOfJoining && { dateOfJoining: draft.dateOfJoining === '' ? null : draft.dateOfJoining }),
    ...(qualification !== before.qualification && { qualification: qualification === '' ? null : qualification }),
  };
  return { ok: true, body: Object.keys(basicDetails).length ? { basicDetails } : {} };
}

// ── Address ────────────────────────────────────────────────────────────────────────────────

export type AddressDraft = UserAddressDto;
export const EMPTY_ADDRESS: AddressDraft = { district: '', state: '', pincode: '', country: 'India' };

export function addressToDraft(address: UserAddressDto | null | undefined): AddressDraft {
  return address ? { ...address } : { ...EMPTY_ADDRESS };
}

export function buildAddress(before: UserAddressDto | null | undefined, draft: AddressDraft): BuildResult<UpdateUserDto> {
  const address: UserAddressDto = {
    district: squash(draft.district),
    state: squash(draft.state),
    pincode: draft.pincode.trim(),
    country: squash(draft.country),
  };
  const errors = {
    district: address.district === '' ? 'Enter a district.' : undefined,
    state: address.state === '' ? 'Enter a state.' : undefined,
    country: address.country === '' ? 'Enter a country.' : undefined,
    pincode:
      address.pincode === ''
        ? 'Enter a pincode.'
        : address.country.toLowerCase() === 'india' && !/^[1-9]\d{5}$/.test(address.pincode)
          ? 'An Indian pincode is 6 digits.'
          : undefined,
  };
  if (Object.values(errors).some(Boolean)) return fail(errors);
  // The API takes a complete address, never field by field.
  const same = before && JSON.stringify(before) === JSON.stringify(address);
  return { ok: true, body: same ? {} : { basicDetails: { address } } };
}

// ── Bank ───────────────────────────────────────────────────────────────────────────────────

export interface BankDraft {
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string;
}

export function bankToDraft(bank: UserBankDetailsDto | null | undefined): BankDraft {
  return {
    bankName: bank?.bankName ?? '',
    ifsc: bank?.ifsc ?? '',
    accountNumber: bank?.accountNumber ?? '',
    accountHolderName: bank?.accountHolderName ?? '',
    branchName: bank?.branchName ?? '',
  };
}

export const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export function buildBank(before: UserBankDetailsDto | null | undefined, draft: BankDraft): BuildResult<UpdateUserDto> {
  const bankName = squash(draft.bankName);
  const ifsc = draft.ifsc.trim().toUpperCase();
  const accountNumber = draft.accountNumber.replace(/\s+/g, '');
  const accountHolderName = squash(draft.accountHolderName);
  const branchName = squash(draft.branchName);
  const errors = {
    bankName: bankName === '' ? 'Enter the bank name.' : undefined,
    ifsc: ifsc === '' ? 'Enter the IFSC code.' : IFSC.test(ifsc) ? undefined : 'An IFSC is 4 letters, a 0, then 6 letters or digits.',
    accountNumber:
      accountNumber === '' ? 'Enter the account number.' : /^\d{6,20}$/.test(accountNumber) ? undefined : 'Use 6 to 20 digits.',
    accountHolderName: accountHolderName === '' ? "Enter the account holder's name." : undefined,
  };
  if (Object.values(errors).some(Boolean)) return fail(errors);
  const next = { bankName, ifsc, accountNumber, accountHolderName, branchName: branchName || null };
  const same = before && JSON.stringify({ ...before, branchName: before.branchName ?? null }) === JSON.stringify(next);
  return {
    ok: true,
    body: same ? {} : { bankDetails: { bankName, ifsc, accountNumber, accountHolderName, ...(branchName && { branchName }) } },
  };
}

/** `••••1234` — enough to recognise the account, not enough to read it out. */
export function maskAccount(accountNumber: string): string {
  return accountNumber.length <= 4 ? '••••' : `••••${accountNumber.slice(-4)}`;
}

// ── Work assignment (designation, pay band, manager) ───────────────────────────────────────

export interface WorkDraft {
  designationId: string;
  payBandId: string;
  managerId: string;
}

export function workToDraft(profile: UserDetailDto['profile']): WorkDraft {
  return {
    designationId: profile?.designationId ?? '',
    payBandId: profile?.payBandId ?? '',
    managerId: profile?.managerId ?? '',
  };
}

/** Sends only what changed, so a manager change does not re-send (and race on) the pay band. */
export function buildWork(before: UserDetailDto['profile'], draft: WorkDraft, selfId: string): BuildResult<UpdateUserDto> {
  const was = workToDraft(before);
  const errors = {
    // The API only checks that the manager exists; an employee reporting to themselves breaks the approval chain.
    managerId: draft.managerId === selfId ? 'An employee cannot report to themselves.' : undefined,
  };
  if (errors.managerId) return fail(errors);
  const body: UpdateUserDto = {
    // The API cannot clear these, so an empty choice is not sent.
    ...(draft.designationId && draft.designationId !== was.designationId && { designationId: draft.designationId }),
    ...(draft.payBandId && draft.payBandId !== was.payBandId && { payBandId: draft.payBandId }),
    ...(draft.managerId && draft.managerId !== was.managerId && { managerId: draft.managerId }),
  };
  return { ok: true, body };
}

// ── What is still missing ──────────────────────────────────────────────────────────────────

/**
 * Why a FIELD employee is still onboarding. Mirrors `computeUserStatus` in the API: name, mobile,
 * date of birth, a complete address, designation, pay band, manager, and the four required bank
 * fields. Guardian, qualification, branch, joining date and documents are optional.
 */
export function missingForActive(user: UserDetailDto): string[] {
  if (user.role !== 'FIELD' || user.status === 'inactive') return [];
  const p = user.profile;
  const a = p?.address;
  const b = p?.bankDetails;
  const missing: string[] = [];
  if (!user.name) missing.push('Name');
  if (!p?.mobileNumber) missing.push('Mobile number');
  if (!p?.dateOfBirth) missing.push('Date of birth');
  if (!(a?.district && a.state && a.pincode && a.country)) missing.push('Address');
  if (!p?.designationId) missing.push('Designation');
  if (!p?.payBandId) missing.push('Pay band');
  if (!p?.managerId) missing.push('Manager');
  if (!(b?.bankName && b.ifsc && b.accountNumber && b.accountHolderName)) missing.push('Bank details');
  return missing;
}
