/**
 * Role vocabulary and access-token shape, shared by `apps/api` and, once it exists, the mobile
 * app.
 *
 * This lives here (not inside the `identity` module) because `shared/http/authorize.middleware.ts`
 * needs `RoleName` for role-gating but cannot import `modules/identity/` — `shared/` sits below
 * every module (see `docs/engineering/boundaries-and-enforcement.md`). `@greynote/contracts` is
 * the one place both shared middleware and the `identity` module can import it from without
 * violating that boundary.
 */

export const ROLE_NAMES = ['ADMIN', 'HR', 'ACCOUNTANT', 'FIELD'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

/**
 * The stateless access-token payload. Verified by signature and expiry only — no DB lookup — so
 * everything a request-time authorization check needs must be baked in here at sign time.
 */
export interface AccessTokenPayload {
  /** `User.id`. */
  sub: string;
  role: RoleName;
  employeeCode: string;
  iat: number;
  exp: number;
}

/** The signed-in user, as `GET /identity/auth/me` and the login response return it. */
export interface UserSummaryDto {
  id: string;
  employeeCode: string;
  name: string;
  role: RoleName;
  designationId: string | null;
  managerId: string | null;
  status: string;
  /** The profile picture's address; null when there is none. */
  photoUrl?: string | null;
}

export interface LoginRequestDto {
  employeeCode: string;
  password: string;
  deviceId: string;
  deviceName: string;
  deviceModel: string;
  platform: 'ANDROID' | 'IOS' | 'WEB';
}

/**
 * Login / refresh response. `refreshToken` is present only for a client that sent
 * `X-Client: mobile`; a browser gets it as an httpOnly cookie instead and never sees it.
 */
export interface AuthTokensDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export interface LoginResponseDto extends AuthTokensDto {
  user: UserSummaryDto;
}
