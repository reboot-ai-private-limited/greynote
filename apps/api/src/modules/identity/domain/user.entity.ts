import type { RoleName } from '@greynote/contracts';

/** `pending` = onboarding incomplete (FIELD role only), `inactive` = deactivated/offboarded. */
export type UserStatus = 'active' | 'pending' | 'inactive';

/**
 * The lean account/org-identity record — every role. Personal details, bank details, documents,
 * designation, pay band, manager, and joining date are FIELD-only and live in `EmployeeProfile`
 * instead (`employeeProfile.entity.ts`) — mixing unbounded/FIELD-only data into this record was
 * the exact coupling worth avoiding before real data existed. Compliance-block history lives in
 * `ComplianceBlock` (`complianceBlock.entity.ts`); only the fast `isBlocked` flag stays here.
 */
export interface User {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: UserStatus;
  roleId: string;
  passwordHash: string;
  lastLoginAt: Date | null;
  isBlocked: boolean;
  /** Set when the account was deleted (personal data scrubbed, records kept). Absent/null: never deleted. */
  deletedAt?: Date | null;
  /** A reviewer's demo account (Play Store). Left out of payroll, attendance and the daily jobs; cannot be deleted. */
  isDemo?: boolean;
}

/**
 * What most other modules/consumers need for display or authorization — never `passwordHash`.
 * `designationId`/`managerId` come from `EmployeeProfile`, not `User` — `toUserSummary` takes it
 * as an optional argument since a FIELD user may not have one yet (still onboarding) and a
 * non-FIELD user never will.
 */
export interface UserSummary {
  id: string;
  employeeCode: string;
  name: string;
  role: RoleName;
  designationId: string | null;
  managerId: string | null;
  status: UserStatus;
}

export function toUserSummary(
  user: User,
  role: RoleName,
  profile?: { designationId: string | null; managerId: string | null } | null,
): UserSummary {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    name: user.name,
    role,
    designationId: profile?.designationId ?? null,
    managerId: profile?.managerId ?? null,
    status: user.status,
  };
}
