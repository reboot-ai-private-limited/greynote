# Identity

The Tier 1 module: who a user is, what they're allowed to do, and who they report to. Every
other module depends on it, directly or through the Approval Workflow Engine — see PRD §4
(personas), §5.2 (Designation/Pay Band), and §7.1 (approval routing). Full schema:
[`../erd/01-identity-hierarchy.md`](../erd/01-identity-hierarchy.md).

## What it owns

- **`Role`** — `ADMIN`, `HR`, `ACCOUNTANT`, `FIELD`. One row per role name.
- **`Designation`** — `MR`, `ASM`, `RSM`, `ZSM`, `NSM`, with a `level` fixed by the name (MR 1 … NSM 5, in code; nobody types it) used to order the
  reporting chain. FIELD-role only.
- **`PayBand`** — a **pay grade** — free-text name (up to 20 characters, unique ignoring case; no cap on how many), holding **no CTC** (a grade has no range; the CTC is set per employee and is independent of the grade — decision-log 2026-10-06), `taPerKmRatePaise`, and three DA rates
  (`hqDaPaise`, `exStationDaPaise`, `outStationDaPaise`, one per `Route.type`), all whole paise
  (₹7.50 per km is `750`; `../engineering/coding-standards.md`, *Money*). FIELD-role
  only; feeds TA/DA auto-calculation ([`hld/06`](../hld/06-ta-da-auto-calculation.md)) and Payroll
  ([`payroll.md`](payroll.md)).
- **`PayComponent`** — one line of the org-wide CTC formula (Basic, FDA, EPF, ESI, Medical, Other allowance…): `code`, `kind`, a
  rule (percent of CTC, percent of other components, fixed, or the single balancer), `order`, `isActive`.
  `domain/ctcBreakdown.ts` is the pure function that splits a CTC by it; the decision is in `../decision-log.md` (2026-10-05).
- **`CtcAssignment`** — an append-only revision of a FIELD employee's CTC: amount, `effectiveFrom` month, the frozen breakdown
  lines, HR's per-line overrides. Payroll reads the one in force for a month through `getCtcForMonth`.
- **`Promotion`** — a scheduled change of a FIELD employee's designation, grade and/or manager (and optionally a new CTC) that takes effect on the
  **1st of a chosen month** (the next month at the earliest), with the team handed over in the same record (`teamMoves`: each current direct report and
  their manager from that month; the promoted person's own id means "stays"). Status `SCHEDULED` / `APPLIED` / `CANCELLED`; one `SCHEDULED` per employee (a
  partial unique index). It keeps what the employee was (`from*`). Nothing about the employee changes until it applies. `domain/promotionPlan.ts` is the
  pure judgement (problems stop it, warnings never do); `application/usecases/promotionPlanner.ts` gathers the facts. Decision-log 2026-10-06; sign-off K13–K19.
- **Applying (`applyDuePromotions.usecase.ts`).** The server starts a job on boot and every hour (`shared/jobs/intervalJob.ts`, wired in `server.ts`; no scheduler dependency, no cron), which applies each promotion whose month is this month or earlier, oldest first. Each is **claimed atomically** (`claimedAt`, a 10-minute lease), so two servers never apply one twice and a crashed run is retried once the lease lapses. Steps, each safe to repeat: (1) the CTC revision from the promotion month, recorded on the promotion straight away so a retry does not save another; (2) each planned move, only if the report still reports to the promoted person and the new manager is still active and no loop; (3) the person's own designation, grade and manager (a manager that is no longer usable is skipped with a note — pay and grade never wait on a team detail). Reports who were not in the plan stay with the promoted person (`unplannedReportIds`); moves that could not be done are `skippedMoves`; both show as "attention" until fixed. An exception leaves it SCHEDULED with the reason in `note`.
- **`ManagerChange`** — append-only dated history of every change of an employee's manager (`managerId`, `previousManagerId`, `effectiveFrom` month, `source`
  PROFILE_EDIT, PROMOTION or BULK_REASSIGN). `managerAsOf(changes, current, month)` answers who they reported to in a month, so a report for a past month can use the team as
  it was then. A profile edit takes the whole month it is made in.
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
  `User`: `reason`, `blocked_at`, `unblocked_by`, `unblocked_by_role`, `unblock_reason`, `unblocked_at`. Retention is indefinite (no
  TTL). `User.is_blocked` is kept in sync with whether an "open" row (`unblocked_at: null`)
  exists for that user.
- **`UserSession`** — one row per logged-in device: `device_id`, `refresh_token_hash`,
  `issued_at`/`expires_at`/`last_active_at`/`revoked_at`, and `revoked_reason` (`ROTATED`,
  `LOGOUT`, `ADMIN`, `PASSWORD_RESET`, `THEFT`). Makes per-device revocation possible; access
  tokens themselves are never persisted.
- **`UserDevice`** — FIELD employees only: the phones they're allowed to use. `device_id`,
  `device_name`, `device_model`, `platform`, `status` (`PENDING` / `REGISTERED` / `REJECTED` /
  `REMOVED`), `requested_at`, `decided_at`/`decided_by` (the Admin), and `expires_at` (set only
  on `REJECTED`; a TTL index deletes the row when it passes). At most one `PENDING`/
  `REGISTERED`/`REJECTED` row per phone per employee; `REMOVED` rows are kept as history.

## Public contract

`IdentityPublicContract` (`identity.public.ts`), the only thing another module may import —
same shape as `health.public.ts`, just with real methods:

- `login(employeeCode, password, device)` / `refresh(refreshToken)` / `logout(refreshToken)` —
  the auth flows below, exposed for `interface/` to call, not typically consumed by other
  modules directly.
- `getUserSummary(userId)` — id, name, role, designation, manager id. What most other modules
  need for display or authorization checks without pulling the whole entity.
- `getUserSummaries(userIds)` — batched `getUserSummary` (three queries for any number of ids),
  for list screens such as the approval queues' submitter names.
- `findUserSummary(userId)` — the same, but `null` for an unknown id instead of a 404, for a
  caller validating an id it was given (Territory's route assignment turns it into a 400).
- **`getManagerChain(userId)`** — walks `EmployeeProfile.manager_id` upward and returns the
  ordered chain: the Nearest Higher Manager first, then everyone above them, up to the top
  (`manager_id: null`).
  This is Identity's most-consumed method: the Approval Workflow Engine
  ([`hld/05`](../hld/05-approval-workflow-engine.md), [`roadmap.md`](../roadmap.md) phase 3) calls
  it to resolve both the Stage-1 approver (chain[0]) and the read-only-visibility set (chain[1:])
  for every approvable submission in Planning, Field Activity and Marketing. Returning the full
  chain rather than just the nearest manager means the approval engine never has to call back
  into Identity recursively per level.
- **`getDirectReports(managerId)`** — everyone whose `manager_id` is this user, by name: the
  people whose submissions this manager approves at Stage 1 (HLD 05).
- **`getDownline(managerId)`** — everyone below at any depth, each with `depth` (1 = direct
  report), sorted by depth then name. One `$graphLookup` over `EmployeeProfile.manager_id`
  (indexed), then one batched query each for users, profiles and roles — never one query per
  member, since a top manager's downline is the whole field force. Computed live, never stored
  (HLD 05 §3); cycles in bad data terminate and never include the manager themselves. Consumers:
  the approval module (read-only visibility), the Team tab, Marketing's target rollup.
  Both include inactive and pending users; callers filter.
- `isFieldRole(userId)` / `getPayBandRates(userId)` — used by TA/DA auto-calculation and Payroll.
- `listActiveFieldUserIds()` / `getLastBlockClearedAt(userId)` — the missed-DCR job's roster, and the day after which it counts an employee's misses again once an Admin has cleared a block (Phase 6 step 9).
- `getActiveDeviceCount(userId)` — number of active sessions (not registered devices). No
  consumer yet.

## Write-path rules & invariants

- **Designation, Pay Band, manager, and joining date only apply to FIELD role**, enforced at write
  time, not just by convention — attempting to set designation/pay-band on a non-FIELD user is
  rejected, and an `ADMIN`/`HR`/`ACCOUNTANT` user never gets an `EmployeeProfile` row at all.
  Consequently Payroll only ever processes FIELD-role users.
- **The reporting chain cannot loop.** Setting a manager is refused (`400`, `field: managerId`) if the
  chosen person is the employee, or already reports to them directly or through the chain, because
  approval routing walks the chain upward and must reach the top. The check walks up from the new
  manager (bounded at 50 steps) and ends quietly on a loop that does not involve the employee.
- **Optional profile fields can be cleared.** In the onboarding `PATCH`, `guardianName`,
  `qualification` and `dateOfJoining` accept `null` to clear; a missing key leaves them alone. The
  fields `computeUserStatus` needs (name, mobile, date of birth, address, designation, pay band,
  manager, bank details) can be changed but not cleared, since clearing one would quietly demote an
  active employee to `pending`. Bank `branchName` clears by sending the whole bank object without it.
- **A deactivated account cannot sign in.** `status: inactive` (set through the onboarding `PATCH`, and
  never reversed by it) ends every session of the employee at that moment. Login, after the password
  check and before the device registry, and refresh both refuse an inactive account (`403` on login,
  `401` on refresh, "This account has been deactivated"). An access token already issued stays valid
  until it expires (`JWT_ACCESS_TOKEN_TTL_SECONDS`, 15 minutes), because the middleware reads the
  token only.
- **One auth mechanism for every role**: `employee_code` + `password_hash`, web and mobile alike.
  No OTP for now — the client confirmed password login (`client-sign-off.md` A1).
- **Every new phone a field employee uses needs Admin approval, including the first**
  (`client-sign-off.md` A2–A3). After the password check, a FIELD login looks up the phone's
  `UserDevice` row:
  - `REGISTERED` → logs in.
  - `PENDING` → `409`, `data.reason: DEVICE_APPROVAL_PENDING` ("Waiting for Admin to approve
    this device"). No duplicate request.
  - `REJECTED` and not yet expired → `403`, `DEVICE_REJECTED`, with `retryAfter`.
  - No row, and `PENDING + REGISTERED` already at `MAX_REGISTERED_DEVICES_FIELD` (Config,
    default `2`) → `409`, `DEVICE_LIMIT_REACHED` ("You already have 2 devices. Ask Admin to
    remove an old device first"). **No request is created.**
  - No row, under the limit → a `PENDING` row is created and the login is refused with
    `DEVICE_APPROVAL_PENDING`. The employee logs in again once Admin approves.
  Web-portal roles have no registry and no limit; none of this runs for them.
- **Logging out never frees a slot.** Only Admin removing a registered device (or rejecting a
  pending one) does. Re-login on a registered phone just replaces that phone's session.
- **Rejections expire.** Rejecting sets `expires_at = now + REJECTED_DEVICE_TTL_DAYS` (Config,
  default `7`). Until then the phone gets `DEVICE_REJECTED`; afterwards the row is deleted and the
  phone counts as new.
- **Only reuse of a `ROTATED` refresh token is theft.** A token revoked by logout, Admin or a
  password reset just returns `401` on refresh, so ending one phone's session never logs the
  employee out of their other phone.
- **Password reset is Admin-only** (`client-sign-off.md` A5). It re-hashes the password and ends
  every session (`PASSWORD_RESET`); registered devices stay registered.
- **The compliance block is system-set; Admin or a manager above the employee clears it, with a reason (decision-log 2026-10-12).** A background job
  ([`hld/10`](../hld/10-submission-gating-and-compliance-block.md)) creates a new `ComplianceBlock`
  row and sets `User.is_blocked = true` — never a person, so there's no `blocked_by` on the row.
  Clearing it (closing the open row with `unblocked_by`/`unblocked_at`, plus flipping
  `is_blocked` back to `false`) is allowed to an `ADMIN` or to any manager above the employee in the chain (`getManagerChain`); a
  manager outside the chain gets `404`, the employee themselves and HR get `403`. The body `{ reason }` is **required** and is stored on the
  block row with `unblocked_by_role` — that row is the audit trail. This replaces the earlier "Admin only" carve-out. The close-the-row-and-flip-the-flag pair
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
- **Rotation + reuse detection**: every refresh revokes the old `UserSession` row (reason
  `ROTATED`) and issues a new one for the same device. A refresh token presented after it's
  already been rotated is treated as theft and revokes **every** session for that user.
- **Logout** revokes one `UserSession` row. Admin can revoke every row for a user
  (`logout-all`), or just one phone's (device logout / removal).
- **Device limit and rejection TTL are read from `Config` at request time** (`Config`, Tier 0),
  never hardcoded — consistent with the tier order (`hld/03-system-architecture.md`).

## Where `device_id` and `device_name` come from

The backend **can't** work these out by itself. An HTTP request only carries an IP address and a
User-Agent string, and both change or collide too often to identify a phone. The app reads them
on the phone and sends them in the login body.

For the planned app (Android, React Native CLI, MMKV — client `TECH NOTES.docx`), use
the `react-native-device-info` package:

| Login field | Source | Example |
|---|---|---|
| `deviceId` | `DeviceInfo.getUniqueId()` → Android `ANDROID_ID` | `a1b2c3d4e5f60718` |
| `deviceName` | `await DeviceInfo.getDeviceName()` | `Rahul's Redmi` |
| `deviceModel` | `` `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}` `` | `Xiaomi Redmi Note 12` |
| `platform` | constant | `ANDROID` |

```ts
import DeviceInfo from 'react-native-device-info';

const body = {
  employeeCode,
  password,
  deviceId: await DeviceInfo.getUniqueId(),
  deviceName: await DeviceInfo.getDeviceName(),
  deviceModel: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
  platform: 'ANDROID',
};
```

- `ANDROID_ID` stays the same across app reinstalls and updates (Android 8+), as long as the
  app's signing key doesn't change. It **changes after a factory reset**, so a reset phone shows
  up as a new device and needs approval again.
- IMEI and serial number can't be read by normal apps since Android 10. Don't plan on them.
- `deviceId` is sent by the phone, so it enforces policy, not security: a rooted phone can fake
  it. The password is still the real credential.
- The web portal (Admin/HR/Accountant) has no device registry. It generates a random UUID once,
  keeps it in `localStorage`, and sends it as `deviceId` so its sessions can still be told apart.
- On a `409`/`403` from login, the app reads `data.reason` (`DEVICE_APPROVAL_PENDING`,
  `DEVICE_LIMIT_REACHED`, `DEVICE_REJECTED`) and shows the matching screen, not a generic error.

The 4 fixed `Role` rows and the very first `ADMIN` user are **not** created through this HTTP
surface at all — no endpoint for either exists. Both are seeded by `apps/api/src/scripts/seed.ts`,
a deploy-time script an operator runs explicitly (`pnpm --filter @greynote/api seed` / `node
dist/scripts/seed.js`), never automatically on server boot. See `docs/decision-log.md`.

## HTTP surface

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/identity/auth/login` | any | `{employee_code, password, device_id, device_name, device_model, platform}` → tokens (`refreshToken` in the body only with `X-Client: mobile`; otherwise an httpOnly cookie, `SameSite=Strict`, path `/api/identity/auth`); with `X-Client: web` a FIELD employee is refused `403` (after the password check); for FIELD on the phone, `409`/`403` with `data.reason` when the phone isn't approved (see rules above) |
| `POST` | `/api/identity/auth/refresh` | any (via refresh token) | Rotate a session. Token from the body (mobile) or, for a browser, the httpOnly `gn_refresh` cookie (needs an `X-Client` header) |
| `GET` | `/api/identity/auth/me` | any | The signed-in `UserSummary` (web boot) |
| `POST` | `/api/identity/auth/logout` | any | Revoke the calling session |
| `POST` | `/api/identity/auth/delete-account` | FIELD (own) | `{password}` — deletes my account: personal data scrubbed, sessions and phones ended, records kept as "Deleted user"; `403` wrong password, `409 HAS_ACTIVE_REPORTS`. Allowed while a past year is viewed |
| `POST` | `/api/identity/auth/delete-account-public` | Public | `{employeeCode, password}` — the form on the company website (Google Play's deletion URL). Same deletion; no token or cookie issued. `401` wrong code or password (same message, same timing), `400` not a field account, `409 HAS_ACTIVE_REPORTS` or already deleted, `429` more than 5 tries in 15 min per address or per code |
| `POST` | `/api/identity/auth/forgot-password` | Public | `{employeeCode}` — an **Admin** forgot their password. Emails a 6-digit code to the owner address in Settings (environment `PASSWORD_RESET_OWNER_EMAIL`), never to the requester. Always `200` with the same words for any code: nothing is sent, stored or counted unless the ID is an active Admin. At most `PASSWORD_RESET_DAILY_LIMIT` (environment, default 3) codes in any 24 hours for the whole system; no owner email = off. `429` more than 5 tries in 15 min per address or per code. Needs `SMTP_*` on the server; a mail failure is logged, not counted
| `POST` | `/api/identity/auth/reset-admin-password` | Public | `{employeeCode, otp, newPassword}` — the code (single use, 10 minutes, 5 wrong tries then dead, only its hash is stored) and a new password. Every failure is the same `400`. Ends every session of that Admin (`PASSWORD_RESET`) and emails the owner that it happened
| `POST` | `/api/identity/users/:id/anonymise` | Admin, HR | The same, on an employee's written request; `409` if already deleted |
| `POST` | `/api/identity/auth/logout-all` | Admin (on behalf of a user) | Revoke every session for a user — offboarding |
| `GET` | `/api/identity/users` | Admin, HR (read) | List/search/paginate/filter users — summary shape only, no personal/bank details |
| `GET` | `/api/identity/users/:id` | Admin, HR | Full detail — `User` + `EmployeeProfile` (if any) + the current open `ComplianceBlock` (if any). The only place personal/bank details are ever returned. |
| `GET` | `/api/identity/users/:id/reporting` | Admin, HR | The employee's reporting line for the web Team tab: `upline` (managers above, nearest first) and `downline` (everyone below at any depth, each with `depth` and `managerId`). Composed from `getManagerChain` and `getDownline` (`GetReportingLineUseCase`) |
| `GET` | `/api/identity/org/children?parentId&page&pageSize` | Admin, HR | One level of the organisation tree: the people under `parentId` (omit for the top: no manager), by name, each with `directCount` and `hqId`. Paged (default 25, max 100); the web opens one branch at a time. `ListOrgChildrenUseCase` |
| `POST` | `/api/identity/users/manager-changes` | Admin, HR | `{userIds[1–100], managerId}`: move several employees under one manager. Everyone is checked first with the single-edit rules (`ManagerRules`: higher designation, no loop, manager not in the selection by loop rule); any failure is a `400` with `data.problems[{userId,name,message}]` and **nothing moves**. People already under that manager are `unchanged`. Each move is a `ManagerChange` (`source: BULK_REASSIGN`, effective from the current month, `createdBy` = caller) |
| `POST` | `/api/identity/users` | Admin, HR | Create a user — `{role, employeeCode, name, password, email?, phone?}`, identical shape for every role now (decision 12's split is about who's allowed to submit which `role`, enforced in the use case, not a field difference). Always writes only `User`; `status: active` for non-FIELD, `pending` for FIELD (no `EmployeeProfile` yet). HR may only submit `role: FIELD` (PRD §5.3); non-FIELD creation is Admin-only. |
| `PATCH` | `/api/identity/users/:id` | Admin, HR | Incremental onboarding update — any of `basicDetails` (now including `dateOfJoining`), `bankDetails`, `designationId`, `payBandId`, `managerId` (each optional per call); upserts `EmployeeProfile` into existence on the first call. `status` is recomputed automatically after each call, not set directly (except `status: 'inactive'` for explicit deactivation, a direct `User` field toggle) |
| `GET`/`POST`/`PATCH` | `/api/identity/pay-components` | read: Admin, HR, Accountant; write: Admin, HR | The org-wide CTC formula. Every write re-validates the whole formula: one balancer, no loops, Basic above 0 (any share up to 100% of the CTC, or a fixed amount), exactly one mandatory professional-tax line. A mandatory line cannot be switched off, made optional or given another kind or rule (2026-10-14) |
| `POST` | `/api/identity/ctc/preview` | Admin, HR | `{ctcAnnualPaise, overrides?, structure?}` → breakdown, gross (the CTC), monthly deductions and take-home, nothing saved. Refused (400) when the earnings exceed the CTC or the monthly salary is below the first `PTAX_SLABS` slab |
| `GET`/`POST` | `/api/identity/users/:id/ctc` | read: Admin, HR, Accountant; write: Admin, HR | An employee's CTC revisions / save a new one `{ctcAnnualPaise, effectiveFrom, overrides?, reason?}`; no grade and no range needed; the response carries `warning` when the CTC is more than `CTC_JUMP_WARN_PERCENT` (50) above the previous revision (saved anyway) |
| `POST` | `/api/identity/users/:id/promotions/preview` | Admin, HR | `{effectiveFrom, toDesignationId?, toPayBandId?, toManagerId?, ctc?, teamMoves[], reason?}` → before and after, the team and where each goes, the CTC breakdown, `warnings`, `problems`, `canSchedule`. Saves nothing |
| `POST` | `/api/identity/users/:id/promotions` | Admin, HR | Schedules it; `400` (with every problem in `details.problems`) while anything in the preview is a problem — above all while a direct report has no new manager. `409` if one is already scheduled |
| `GET` | `/api/identity/users/:id/promotions` | Admin, HR | The employee's promotions, newest first |
| `GET` | `/api/identity/promotions` | Admin, HR | Every promotion, newest first (`?status=`), each with `attention` items: a person not placed, a move that could not be carried out, a note |
| `POST` | `/api/identity/promotions/:promotionId/cancel` | Admin, HR | Only while SCHEDULED (`409` otherwise). Nothing had changed, so nothing is undone; to change one, cancel and schedule again |
| `POST` | `/api/identity/promotions/apply-due` | Admin, HR | Applies every promotion whose month has come, now. The server does the same on start and every hour — there is no operator cron |
| `POST` | `/api/identity/ctc/reapply` | Admin, HR | `{effectiveFrom, reason?, userIds?}` → new revisions from the current formula; per-employee outcome |
| `POST` | `/api/identity/users/:id/documents` | Admin, HR | Upload a document (`multipart/form-data`, field `file` + `documentType`, up to 10 MB) to Cloudinary and attach it to the user. Only a PDF, JPG or PNG, judged by the file's own header, not its name or declared type; anything else is a `400` before it reaches storage |
| `DELETE` | `/api/identity/users/:id/documents/:documentId` | Admin, HR | Remove a document from Cloudinary **and** the user record |
| `PUT` | `/api/identity/users/:id/photo` | Admin, HR | Set or replace the employee photo (`multipart/form-data`, field `file`; JPG, PNG or WebP by its first bytes, up to 5 MB). Stored in Cloudinary at 512×512 under `greynote/users/{id}/photo`; the **old file is deleted** after the new one is saved (and the new one is deleted if the save fails). Returns `{photoUrl}` — the storage id is never sent |
| `DELETE` | `/api/identity/users/:id/photo` | Admin, HR | Deletes the file from Cloudinary first, then clears the record (a failed delete keeps the record, so a retry works) |
| `PUT` / `DELETE` | `/api/identity/employee-drafts/:id/photo` | Admin, HR | The same for a wizard draft (kept in `data.photo`, its own section, so saving Personal never drops it). Finalize moves the reference to the new profile; deleting the draft deletes the file |
| `POST` | `/api/identity/users/:id/unblock` | Admin, or a FIELD manager above the employee | Clear a compliance block; body `{ reason }` (required, kept as the audit trail) |
| `POST` | `/api/identity/users/:id/reset-password` | Admin only | `{newPassword}` → re-hash, end every session |
| `GET` | `/api/identity/devices/pending` | Admin only | Every `PENDING` phone across the org, oldest first, with employee code/name |
| `GET` | `/api/identity/users/:id/devices` | Admin only | One employee's phones (all statuses), with `loggedIn` / `lastActiveAt` |
| `POST` | `/api/identity/users/:id/devices/:deviceRowId/approve` | Admin only | `PENDING` → `REGISTERED` |
| `POST` | `/api/identity/users/:id/devices/:deviceRowId/reject` | Admin only | `PENDING` → `REJECTED` until `REJECTED_DEVICE_TTL_DAYS` pass |
| `DELETE` | `/api/identity/users/:id/devices/:deviceRowId` | Admin only | `REGISTERED` → `REMOVED` and end its sessions (one transaction); frees a slot |
| `POST` | `/api/identity/users/:id/devices/:deviceRowId/logout` | Admin only | End that phone's sessions; it stays registered |
| `GET`/`POST`/`PATCH` | `/api/identity/roles` | Admin | Master-data CRUD (a fixed set of four names) |
| `GET`/`POST`/`PATCH` | `/api/identity/designations`, `/pay-bands` | Admin, HR | Master-data CRUD. `GET /pay-bands` is also open to the Accountant (view-only pay grades, PRD §5.3) |

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


## The employee list (2026-10-09)

`GET /identity/users` returns, per row, `managerName` (one batched lookup per page), and `hqId` / `zoneId` from the profile's copy of the current HQ (`recordUserTerritory`, called by Territory after it saves an assignment; `UpdateUser` carries the two fields through untouched). `migrate:profile-territory` fills the copy for employees who already had an HQ. The web table maps the ids to names with the zone and HQ directories and makes the whole row open the profile (`DataTable` `onRowClick`).

## Adding a field employee: the wizard (web, 2026-10-09)

`/employees/new` replaces the create-then-setup pair for FIELD employees (decision-log 2026-10-09). Eight steps — Personal, Address, Qualifications, Experience, Bank, Work, Pay, Review — held as strings in `features/people/lib/onboarding.ts` (pure, tested: `stepErrors`, `canOpen`, `firstOpenStep`, `toDraftData`/`fromDraftData`). Each Next saves an `EmployeeDraft` (`employee-drafts` routes, Admin/HR); the last step calls `POST /employee-drafts/:id/finalize` (`FinalizeEmployeeDraftUseCase`), which allocates the next `GHC` code (GHC001, GHC002 …; decision-log 2026-10-15) (`MongoEmployeeCodeGenerator`, atomic counter), generates the password, then runs `CreateUser`, `UpdateUser`, the territory HQ assignment (bound into Identity at composition, `identity.bindHqAssigner`), the covered Zones and HQs (`work.zoneIds`, `work.hqIds`; `bindCoverageAssigner` → `assignUserCoverage`) and the route assignments (`work.routeIds`; `bindRouteAssigner` → `assignUserRoutes`, which skips routes already held so a retry is safe). What a designation must have is checked at finalize: an MR, ASM or RSM an HQ, a ZSM a Zone, an MR at least one route; the NSM nothing and `AssignCtc`, and returns the credentials once. Required-field gaps are computed by `draftGaps` (`domain/employeeDraft.entity.ts`); the manager is not required when `isTopDesignation` (highest existing level). `/employees/new/staff` keeps the plain form for office logins; it has no code field, `CreateUser` takes the next GHC code from the same counter.

## Setting a field employee up step by step (web, 2026-10-06; older employees)

`/employees/:id/setup` walks a new FIELD employee through **Personal details, Address, Work, Bank details, Compensation, Documents**. Each step is the same section the profile shows,
opened for editing, and saves on its own through the existing onboarding `PATCH`/CTC/document endpoints, so there is no new API and nothing is lost by stopping: the profile's "still to
fill in" banner links back with *Continue setup*. The four required steps (everything `computeUserStatus` needs for `active`) show a check once the profile has them; Compensation and
Documents are optional. Creating a FIELD employee goes straight to the first open step; other roles go to their profile.

## Promotion in the web (2026-10-06)

`features/people`: the **Promotion** tab on a field employee (`PromotionTab`: history of `PromotionCard`s and a Promote button), the page `/employees/:id/promote` (`PromotionScreen`), and `/promotions` (`PromotionsScreen`, Admin and HR, in the People nav). The form's strings become the request in `lib/promotion.ts` (pure, tested); the team table, preview, problems and warnings all come from `POST …/promotions/preview`, debounced, so the screen holds no promotion rules of its own. The team table (`PromotionTeamTable`) places one person, a ticked group, or everyone through the existing manager picker, and "stays with" keeps them under the promoted person (a warning, not a block). Schedule is enabled only when the preview has no problems and is not still being worked out. The leave card shows the balances of the financial year in view and says a promotion leaves them untouched. `/promotions` lists Needs attention first (derived on the server from the current state) and has Cancel and "Apply due promotions now".

## CTC: Basic % and a per-employee breakdown (2026-10-09)

`computeStructuredBreakdown(org, ctc, structure, overrides)` = `computeCtcBreakdown(applyStructure(org, structure), ctc, overrides)` (`domain/ctcBreakdown.ts`). `applyStructure` drops `removed`, applies `ruleOverrides` and the Basic %, appends `extras`, and refuses removing Basic or the balancer, re-ruling them, a second balancer, clashing codes, and removing a line another is worked out from. `POST /ctc/preview`, `POST /users/:id/ctc` and the draft finalize take `structure`; re-apply and promotions reuse the latest revision's. Web: `lib/ctcStructure.ts` (form state, rules, request, totals), `useCtcEditor`, and `components/ctc/` (`CtcSummaryCard`, `CtcBreakdown` with `CtcLineRow` editing in place, `CtcAddLineDialog`), used by the full page `/employees/:id/ctc` (`CtcScreen`, opened from the Compensation tab; the tab is selected again with `?tab=compensation`) and by the wizard's Pay step (compact summary, same breakdown). The earlier dialog version (`CtcFormDialog`, `CtcBreakdownEditor`) is gone.

### CTC and pay components from 2026-10-14

The CTC is the employee's **total earnings** (decision-log 2026-10-14): `EARNING` lines add up to it exactly (the balancer takes the rest; checked on every save). **CTC and Basic are the inputs**; Basic is `basicBasisPoints` (up to 10000) or `basicMonthlyPaise` in the employee's `structure`; the rest is derived. `DEDUCTION` lines (EPF 12% of Basic + FDA, ESI `ESI_PERCENT` while the monthly salary is at or below `ESI_WAGE_CEILING`, professional tax `PTAX_SLAB` from `PTAX_SLABS`) are worked out beside the earnings and frozen in the revision's `lines`. A monthly salary below the first slab's `from` (₹10,000) cannot be assigned. `mandatory` components cannot be removed or re-ruled per employee. The breakdown reads the two settings through `CtcContextPort` (`ConfigCtcContext`); a changed setting reaches saved CTCs through Re-apply. `migrate:ctc-statutory` moves an older database to this shape.

**Basic 100% (decision-log 2026-10-14):** when Basic is the whole CTC (`isBasicOnly`), `computeStructuredBreakdown` keeps only Basic and the mandatory lines (professional tax); other earnings, EPF and ESI drop out, and added lines / rule changes / typed amounts are refused. A monthly gross below the first `PTAX_SLABS` band pays no professional tax (it is not refused).

## Reporting manager rules (2026-10-15)

- A manager must have a **higher designation** than the employee (`UpdateUserUseCase.assertManagerIsHigher`); levels may be skipped, so an RSM can report to an NSM when there is no ZSM. Admin/HR users used as a manager have no designation and are not checked.
- The manager is **optional for everyone** (`computeUserStatus` and `draftGaps` no longer require it). With no manager, approval goes straight to the final approver role (Admin; HR for leave): `TOP_OF_CHAIN` in `approval/domain/approvalRules.ts`, unchanged.
- `FieldEmployeeRow` carries `designationId` and `designationLevel`. The wizard and profile pick the manager through Territory's `manager-candidates` (see LLD territory.md).
