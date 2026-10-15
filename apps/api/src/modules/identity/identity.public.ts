import type { RoleName } from '@greynote/contracts';
import type { LoginInput, LoginOutput } from './application/usecases/login.usecase.js';
import type { RefreshSessionOutput } from './application/usecases/refreshSession.usecase.js';
import type { DownlineMember } from './application/usecases/getDownline.usecase.js';
import type { EmploymentDetails } from './application/usecases/getEmploymentDetails.usecase.js';
import type { CtcAssignment } from './domain/ctcAssignment.entity.js';
import type { PayBand } from './domain/payBand.entity.js';
import type { UserSummary } from './domain/user.entity.js';

export type { CtcAssignment } from './domain/ctcAssignment.entity.js';
export type { DownlineMember } from './application/usecases/getDownline.usecase.js';
export type { EmploymentDetails } from './application/usecases/getEmploymentDetails.usecase.js';

/** An active field employee as the Sales Dashboard lists them: designation name and the HQ and Zone copied onto the profile. */
export interface FieldEmployeeRow {
  id: string;
  employeeCode: string;
  name: string;
  designation: string | null;
  designationId: string | null;
  /** MR 1 … NSM 5; `null` without a designation. */
  designationLevel: number | null;
  hqId: string | null;
  zoneId: string | null;
  managerId: string | null;
}

/** An active user as an Inbox audience is resolved: role, and (FIELD only) the HQ and Zone copied onto the profile. */
export interface Recipient {
  id: string;
  role: RoleName;
  hqId: string | null;
  zoneId: string | null;
}

/** The only thing another module may import from `identity/`. */
export interface IdentityPublicContract {
  login(input: LoginInput): Promise<LoginOutput>;
  refresh(refreshToken: string): Promise<RefreshSessionOutput>;
  logout(callerUserId: string, refreshToken: string): Promise<void>;
  getUserSummary(userId: string): Promise<UserSummary>;
  /** Batched summaries in three queries; unknown ids are skipped. */
  getUserSummaries(userIds: string[]): Promise<UserSummary[]>;
  /** Like `getUserSummary`, but `null` for an unknown id — for callers validating an id they were given. */
  findUserSummary(userId: string): Promise<UserSummary | null>;
  /** Nearest Higher Manager first, then everyone above, `[]` at the top of chain. */
  getManagerChain(userId: string): Promise<UserSummary[]>;
  /** Everyone whose manager is this user, by name. */
  getDirectReports(managerId: string): Promise<UserSummary[]>;
  /** Everyone below this user at any depth (`depth` 1 = direct report), by depth then name. */
  getDownline(managerId: string): Promise<DownlineMember[]>;
  isFieldRole(userId: string): Promise<boolean>;
  /** The designation level of each of these users (MR 1 … NSM 5); users without a designation (office staff, Admin) are left out. */
  getDesignationLevels(userIds: string[]): Promise<Array<{ userId: string; level: number }>>;
  /** Whether a compliance block (HLD 10) stops this user submitting anything new. */
  isBlocked(userId: string): Promise<boolean>;
  /**
   * Blocks an active field employee (HLD 10) — the missed-DCR job's trigger. Records the event and sets the
   * flag in one transaction. `true` if this call blocked them, `false` if they were already blocked
   * (idempotent, safe to run twice). Only Admin can clear it, through Identity's own endpoint.
   */
  blockUser(userId: string, reason: string): Promise<boolean>;
  /** Every active FIELD employee's id — who the missed-DCR job checks. */
  listActiveFieldUserIds(): Promise<string[]>;
  /** Every active user of any role, with the place a field employee sits in — who an Inbox message can reach. */
  listActiveRecipients(): Promise<Recipient[]>;
  /** Every active FIELD employee (never office staff), or only those among `onlyIds`, by name — a dashboard's rows. */
  listFieldEmployees(onlyIds?: string[]): Promise<FieldEmployeeRow[]>;
  /** When an Admin last cleared a compliance block on this user, or `null` if none ever was. The missed-DCR job counts only days after it. */
  getLastBlockClearedAt(userId: string): Promise<Date | null>;
  /** Pay Band and joining date (FIELD only); `null` without an EmployeeProfile. */
  getEmploymentDetails(userId: string): Promise<EmploymentDetails | null>;
  getPayBandRates(userId: string): Promise<PayBand>;
  /** Every Pay Band's id and grade name (G1…) — for grade-wise masters like HR's Leave Master. */
  listPayBands(): Promise<Array<{ id: string; name: PayBand['name'] }>>;
  /** The CTC revision in force for a payroll month (`YYYY-MM`), or `null` if none was assigned by then. */
  getCtcForMonth(userId: string, month: string): Promise<CtcAssignment | null>;
  getActiveDeviceCount(userId: string): Promise<number>;
  /**
   * Territory's write-back: copies a field employee's CURRENT HQ and zone onto their profile, so the employee list can show
   * them without reading Territory. Called by `SetUserHq` after the assignment itself is saved.
   */
  recordUserTerritory(userId: string, territory: { hqId: string; zoneId: string }): Promise<void>;
}
