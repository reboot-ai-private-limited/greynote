import type { RoleName } from '@greynote/contracts';

/** Hands out the next employee code, never the same one twice: ADMIN01, ADMIN02 … for an Admin, GHC001, GHC002 … for everyone else. */
export interface EmployeeCodeGeneratorPort {
  next(role?: RoleName): Promise<string>;
}
