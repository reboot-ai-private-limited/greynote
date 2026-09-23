import type { RoleName } from '@greynote/contracts';
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
 * Required for activation (FIELD only) — flagged as a default assumption in
 * docs/decision-log.md, not fully pinned by the PRD/ERD: name, mobileNumber, dateOfBirth, a
 * complete address, designationId, payBandId, managerId, and the bank details needed to actually
 * pay someone (bankName/ifsc/accountNumber/accountHolderName). NOT required: guardianName,
 * qualification, bankDetails.branchName, documents.
 */
export function computeUserStatus(user: Omit<User, 'id'>, role: RoleName): UserStatus {
  if (user.status === 'inactive') return 'inactive';
  if (role !== 'FIELD') return 'active';

  const hasCompleteAddress =
    !!user.address?.district && !!user.address.state && !!user.address.pincode && !!user.address.country;

  const hasRequiredBankDetails =
    !!user.bankDetails?.bankName &&
    !!user.bankDetails.ifsc &&
    !!user.bankDetails.accountNumber &&
    !!user.bankDetails.accountHolderName;

  const isComplete =
    !!user.name &&
    !!user.mobileNumber &&
    !!user.dateOfBirth &&
    hasCompleteAddress &&
    !!user.designationId &&
    !!user.payBandId &&
    !!user.managerId &&
    hasRequiredBankDetails;

  return isComplete ? 'active' : 'pending';
}
