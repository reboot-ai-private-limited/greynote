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
