import type { LoginInput, LoginOutput } from './application/usecases/login.usecase.js';
import type { RefreshSessionOutput } from './application/usecases/refreshSession.usecase.js';
import type { DownlineMember } from './application/usecases/getDownline.usecase.js';
import type { PayBand } from './domain/payBand.entity.js';
import type { UserSummary } from './domain/user.entity.js';

export type { DownlineMember } from './application/usecases/getDownline.usecase.js';

/** The only thing another module may import from `identity/`. */
export interface IdentityPublicContract {
  login(input: LoginInput): Promise<LoginOutput>;
  refresh(refreshToken: string): Promise<RefreshSessionOutput>;
  logout(callerUserId: string, refreshToken: string): Promise<void>;
  getUserSummary(userId: string): Promise<UserSummary>;
  /** Like `getUserSummary`, but `null` for an unknown id — for callers validating an id they were given. */
  findUserSummary(userId: string): Promise<UserSummary | null>;
  /** Nearest Higher Manager first, then everyone above, `[]` at the top of chain. */
  getManagerChain(userId: string): Promise<UserSummary[]>;
  /** Everyone whose manager is this user, by name. */
  getDirectReports(managerId: string): Promise<UserSummary[]>;
  /** Everyone below this user at any depth (`depth` 1 = direct report), by depth then name. */
  getDownline(managerId: string): Promise<DownlineMember[]>;
  isFieldRole(userId: string): Promise<boolean>;
  getPayBandRates(userId: string): Promise<PayBand>;
  getActiveDeviceCount(userId: string): Promise<number>;
}
