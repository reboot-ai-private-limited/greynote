import type { RoleName } from '@greynote/contracts';

export interface DirectoryUser {
  id: string;
  name: string;
  employeeCode: string;
  role: RoleName;
  status: 'active' | 'pending' | 'inactive';
}

/** Field Activity's narrow view of Identity; `identity.contract` satisfies it structurally. */
export interface UserDirectoryPort {
  findUserSummary(userId: string): Promise<DirectoryUser | null>;
  /** Batched; unknown ids are skipped. */
  getUserSummaries(userIds: string[]): Promise<DirectoryUser[]>;
  /** Nearest Higher Manager first, then everyone above; `[]` at the top. */
  getManagerChain(userId: string): Promise<DirectoryUser[]>;
  /** Everyone below this manager, at any depth. */
  getDownline(managerId: string): Promise<DirectoryUser[]>;
  /** Whether a compliance block (HLD 10) stops this user submitting anything new. */
  isBlocked(userId: string): Promise<boolean>;
  /** Every active FIELD employee's id — who the missed-DCR job checks. */
  listActiveFieldUserIds(): Promise<string[]>;
  /** When an Admin last cleared a compliance block on this user; `null` if never. */
  getLastBlockClearedAt(userId: string): Promise<Date | null>;
  /** Blocks an active field employee; `false` if they were already blocked (idempotent). */
  blockUser(userId: string, reason: string): Promise<boolean>;
  /** The joining date (`null` if unknown) — days before it are nobody's to report. */
  getEmploymentDetails(userId: string): Promise<{ dateOfJoining: Date | null } | null>;
  /** The user's Pay Band rates, whole paise — TA per km and DA per Area type. */
  getPayBandRates(userId: string): Promise<{ taPerKmRatePaise: number; hqDaPaise: number; exStationDaPaise: number; outStationDaPaise: number }>;
}
