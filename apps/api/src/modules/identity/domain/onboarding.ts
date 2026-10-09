import type { RoleName } from '@greynote/contracts';
import type { EmployeeProfile } from './employeeProfile.entity.js';
import type { User, UserStatus } from './user.entity.js';

/**
 * Pure, no I/O — mirrors `health.entity.ts`'s `summarise()` pattern.
 *
 * Non-FIELD roles are always `active` (none of designation/pay-band/bank/manager applies to
 * them). A FIELD-role user is `active` only once every required field below is present, else
 * `pending`. An already-`inactive` (deactivated/offboarded) user is never upgraded back to
 * `active`/`pending` here — deactivation is a separate, explicit action, not something a PATCH
 * to an onboarding field should silently undo.
 *
 * `profile` is `null` for a FIELD user with no `EmployeeProfile` row yet (onboarding hasn't
 * started) — reads exactly like one with every profile field null.
 *
 * Required for activation (FIELD only) — flagged as a default assumption in
 * docs/decision-log.md, not fully pinned by the PRD/ERD: name, mobileNumber, dateOfBirth, a
 * complete address, designationId, payBandId, managerId, and the bank details needed to actually
 * pay someone (bankName/ifsc/accountNumber/accountHolderName). A manager is required unless the
 * designation is the top one. NOT required: guardianName,
 * qualification, bankDetails.branchName, documents, dateOfJoining, probationMonths, esiNumber.
 */
export function computeUserStatus(
  user: Pick<User, 'status' | 'name'>,
  profile: Omit<EmployeeProfile, 'id' | 'userId'> | null,
  role: RoleName,
  /** The employee's designation is the top of the client's hierarchy, so there is nobody for them to report to. */
  isTopDesignation = false,
): UserStatus {
  if (user.status === 'inactive') return 'inactive';
  if (role !== 'FIELD') return 'active';

  const hasCompleteAddress =
    !!profile?.address?.district &&
    !!profile.address.state &&
    !!profile.address.pincode &&
    !!profile.address.country;

  const hasRequiredBankDetails =
    !!profile?.bankDetails?.bankName &&
    !!profile.bankDetails.ifsc &&
    !!profile.bankDetails.accountNumber &&
    !!profile.bankDetails.accountHolderName;

  const isComplete =
    !!user.name &&
    !!profile?.mobileNumber &&
    !!profile.dateOfBirth &&
    hasCompleteAddress &&
    !!profile.designationId &&
    !!profile.payBandId &&
    (isTopDesignation || !!profile.managerId) &&
    hasRequiredBankDetails;

  return isComplete ? 'active' : 'pending';
}

/**
 * The top of the client's hierarchy: the designation with the highest level among those that exist.
 * Whoever holds it reports to nobody (a client that stops at ZSM has no NSM row, so ZSM is the top).
 */
export function isTopDesignation(designationId: string | null, designations: Array<{ id: string; level: number }>): boolean {
  if (!designationId || designations.length === 0) return false;
  const top = Math.max(...designations.map((d) => d.level));
  return designations.some((d) => d.id === designationId && d.level === top);
}
