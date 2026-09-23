# Identity

The Tier 1 module: who a user is, what they're allowed to do, and who they report to. Every
other module depends on it, directly or through the Approval Workflow Engine — see PRD §4
(personas), §5.2 (Designation/Pay Band), and §7.1 (approval routing). Full schema:
[`../erd/01-identity-hierarchy.md`](../erd/01-identity-hierarchy.md).

## What it owns

- **`Role`** — `ADMIN`, `HR`, `ACCOUNTANT`, `FIELD`. One row per role name.
- **`Designation`** — `MR`, `ASM`, `RSM`, `ZSM`, `NSM`, with a `level` used to validate the
  reporting chain. FIELD-role only.
- **`PayBand`** — `G1`/`G2`/`G3`, carrying `base_salary`, `ta_per_km_rate`, `da_amount`. FIELD-role
  only; feeds TA/DA auto-calculation ([`hld/06`](../hld/06-ta-da-auto-calculation.md)) and Payroll
  ([`payroll.md`](payroll.md)).
- **`User`** — the lean account, every role: `employee_code`, `password_hash`, `role_id`, `status`,
  and `is_blocked` (a fast top-level flag; the historical detail lives in `ComplianceBlock`).
  Personal details, bank details, designation/pay-band/manager, and joining date are **not**
  here — see `EmployeeProfile` below.
- **`EmployeeProfile`** — FIELD-only, one per `User`, created lazily on the first onboarding
  `PATCH`: `designation_id`/`pay_band_id` FKs, a self-referencing `manager_id` (pointing at
  another `User` — single-manager tree, no separate Team table, a manager's downline is derived by
  walking it, never stored separately), `date_of_joining`, and onboarding personal/bank details
  and uploaded documents; see "Onboarding" in `../erd/01-identity-hierarchy.md`.
- **`ComplianceBlock`** — one row per block **event** (not a single overwritable field), FK to
  `User`: `reason`, `blocked_at`, `unblocked_by`, `unblocked_at`. Retention is indefinite (no
  TTL). `User.is_blocked` is kept in sync with whether an "open" row (`unblocked_at: null`)
  exists for that user.
- **`UserSession`** — one row per logged-in device: `device_id`, `refresh_token_hash`,
  `issued_at`/`expires_at`/`last_active_at`/`revoked_at`. This is what makes per-device
  revocation and the device-count limit possible; access tokens themselves are never persisted.

## Public contract

`IdentityPublicContract` (`identity.public.ts`), the only thing another module may import —
same shape as `health.public.ts`, just with real methods:

- `login(employeeCode, password, device)` / `refresh(refreshToken)` / `logout(refreshToken)` —
  the auth flows below, exposed for `interface/` to call, not typically consumed by other
  modules directly.
- `getUserSummary(userId)` — id, name, role, designation, manager id. What most other modules
  need for display or authorization checks without pulling the whole entity.
- **`getManagerChain(userId)`** — walks `EmployeeProfile.manager_id` upward and returns the
  ordered chain: the Nearest Higher Manager first, then everyone above them, up to the top
  (`manager_id: null`).
  This is Identity's most-consumed method: the Approval Workflow Engine
  ([`hld/05`](../hld/05-approval-workflow-engine.md), [`roadmap.md`](../roadmap.md) phase 3) calls
  it to resolve both the Stage-1 approver (chain[0]) and the read-only-visibility set (chain[1:])
  for every approvable submission in Planning, Field Activity and Marketing. Returning the full
  chain rather than just the nearest manager means the approval engine never has to call back
  into Identity recursively per level.
- `isFieldRole(userId)` / `getPayBandRates(userId)` — used by TA/DA auto-calculation and Payroll.
- `getActiveDeviceCount(userId)` — used by the login flow itself, exposed in case a future admin
  screen wants to show a user's active sessions without duplicating the count logic.

## Write-path rules & invariants

- **Designation, Pay Band, manager, and joining date only apply to FIELD role**, enforced at write
  time, not just by convention — attempting to set designation/pay-band on a non-FIELD user is
  rejected, and an `ADMIN`/`HR`/`ACCOUNTANT` user never gets an `EmployeeProfile` row at all.
  Consequently Payroll only ever processes FIELD-role users.
- **One auth mechanism for every role**: `employee_code` + `password_hash`, web and mobile alike.
  No OTP, no separate mPIN for field-force login — both were considered and dropped (ERD Module
  1's design notes).
- **Device limit is FIELD-role only, and it blocks rather than evicts.** A field employee's
  login beyond `MAX_ACTIVE_DEVICES_FIELD` (read from `Config`, default `2`) is rejected with
  `409` and an explicit "log out from another device first" message — never a silent kick of the
  oldest session (PRD §2). Web-portal roles have no limit at all; the check doesn't run for them.
- **Re-login on an already-active device doesn't count against the limit.** Logging in again
  from the same `device_id` just revokes and replaces that device's own session — this is the
  ordinary "token expired, log back in" path, not a new device.
- **The compliance block is system-set, Admin-only to clear.** A background job
  ([`hld/10`](../hld/10-submission-gating-and-compliance-block.md)) creates a new `ComplianceBlock`
  row and sets `User.is_blocked = true` — never a person, so there's no `blocked_by` on the row.
  Clearing it (closing the open row with `unblocked_by`/`unblocked_at`, plus flipping
  `is_blocked` back to `false`) is restricted to an `ADMIN` user specifically, **not** the blocked
  user's Nearest Higher Manager, even though that manager is otherwise the Stage-1 approver for
  everything else this user submits. This is a deliberate carve-out: the block is
  punitive/compliance-driven, not a routine approval. The close-the-row-and-flip-the-flag pair
  happens inside a single MongoDB transaction — the first in this codebase — since either
  succeeding without the other would leave `is_blocked` disagreeing with the block history.
- **Passwords are hashed, never stored or logged in plain text** — check
  [`../engineering/coding-standards.md#logging`](../engineering/coding-standards.md#logging)
  before adding any log line touching a login request.

## Auth & session design

Full sequence diagrams: [`hld/04-authentication-and-sessions.md`](../hld/04-authentication-and-sessions.md).
Summary at LLD depth:

- **Access token**: short-lived JWT (~15 min), stateless — verified per request by signature and
  expiry, no DB lookup.
- **Refresh token**: long-lived opaque random string, stored only as a hash
  (`refresh_token_hash`) on its `UserSession` row.
- **Rotation + reuse detection**: every refresh revokes the old `UserSession` row and issues a
  new one for the same device. A refresh token presented after it's already been rotated is
  treated as theft and revokes **every** session for that user, not just the one in use.
- **Logout** revokes one `UserSession` row (`revoked_at = now()`). Admin can force-revoke every
  row for a user in one call — the same mechanism, not a separate feature, useful for
  offboarding.
- **The device-limit check reads its threshold from `Config` at request time** (`Config`, Tier 0),
  never hardcoded — consistent with the tier order (`hld/03-system-architecture.md`).

The 4 fixed `Role` rows and the very first `ADMIN` user are **not** created through this HTTP
surface at all — no endpoint for either exists. Both are seeded by `apps/api/src/scripts/seed.ts`,
a deploy-time script an operator runs explicitly (`pnpm --filter @greynote/api seed` / `node
dist/scripts/seed.js`), never automatically on server boot. See `docs/decision-log.md`.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/identity/auth/login` | any | `{employee_code, password, device_id, device_name, device_model, platform}` → tokens, or `409` at the device limit |
| `POST` | `/api/identity/auth/refresh` | any (via refresh token) | Rotate a session |
| `POST` | `/api/identity/auth/logout` | any | Revoke the calling session |
| `POST` | `/api/identity/auth/logout-all` | Admin (on behalf of a user) | Revoke every session for a user — offboarding |
| `GET` | `/api/identity/users` | Admin, HR (read) | List/search/paginate/filter users — summary shape only, no personal/bank details |
| `GET` | `/api/identity/users/:id` | Admin, HR | Full detail — `User` + `EmployeeProfile` (if any) + the current open `ComplianceBlock` (if any). The only place personal/bank details are ever returned. |
| `POST` | `/api/identity/users` | Admin, HR | Create a user — `{role, employeeCode, name, password, email?, phone?}`, identical shape for every role now (decision 12's split is about who's allowed to submit which `role`, enforced in the use case, not a field difference). Always writes only `User`; `status: active` for non-FIELD, `pending` for FIELD (no `EmployeeProfile` yet). HR may only submit `role: FIELD` (PRD §5.3); non-FIELD creation is Admin-only. |
| `PATCH` | `/api/identity/users/:id` | Admin, HR | Incremental onboarding update — any of `basicDetails` (now including `dateOfJoining`), `bankDetails`, `designationId`, `payBandId`, `managerId` (each optional per call); upserts `EmployeeProfile` into existence on the first call. `status` is recomputed automatically after each call, not set directly (except `status: 'inactive'` for explicit deactivation, a direct `User` field toggle) |
| `POST` | `/api/identity/users/:id/documents` | Admin, HR | Upload a document (`multipart/form-data`, field `file` + `documentType`) to Cloudinary and attach it to the user |
| `DELETE` | `/api/identity/users/:id/documents/:documentId` | Admin, HR | Remove a document from Cloudinary **and** the user record |
| `POST` | `/api/identity/users/:id/unblock` | Admin only | Clear a compliance block |
| `GET`/`POST`/`PATCH` | `/api/identity/roles`, `/designations`, `/pay-bands` | Admin | Master-data CRUD |

Passwords are capped at 72 bytes (UTF-8) and rejected, not truncated, above that — bcrypt's own
input limit; see `docs/decision-log.md`, 2026-09-23.

## Edge cases

- **A 3rd concurrent FIELD-role device login** → `409`, the documented prompt, no session
  created. Retrying from an already-active device still succeeds (re-login path).
- **A manager with no manager above them** (`manager_id: null`, the NSM-equivalent top of the
  chain) — `getManagerChain` returns an empty chain, and their own submissions route straight to
  Admin per PRD §7.1.4's top-of-chain exception. The approval engine, not Identity, decides what
  an empty chain means; Identity just reports the fact.
- **An Admin/HR/Accountant user with a `designation_id` or `pay_band_id` set** — rejected at
  write time, not silently ignored.
- **A blocked user attempting login** — login itself should still succeed (blocking affects
  *submission*, per `hld/10`, not authentication) unless PRD/HLD later says otherwise; this LLD
  flags it because `hld/10`'s exact interaction with login isn't fully specified yet — confirm
  before implementing.
- **A refresh token reuse after rotation** — revokes every session for the user, including the
  device that's currently, legitimately, mid-use. This is the intended trade-off (`hld/04` §1),
  not a bug to work around.

## Dependencies

None upstream — Tier 1, the lowest real module. Depends only on `Config` (Tier 0) for the
device-limit value.

## Deliberately deferred

- Self-service password reset (nothing in the PRD specifies one; likely Admin-assisted only for
  the first build).
- Any second factor beyond password — considered and dropped for mPIN specifically; not
  reconsidered here.
- Session-list / "log out from here" self-service UI — the API (`logout-all`) supports the
  underlying mechanism, but a user-facing device-management screen isn't in PRD scope for phase 1.
