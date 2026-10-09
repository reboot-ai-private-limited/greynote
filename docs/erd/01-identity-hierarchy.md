# Module 1: Identity & Hierarchy

Covers: `Role`, `Designation`, `PayBand`, `User`, `EmployeeProfile`, `ComplianceBlock` — and the self-referencing reporting chain that drives approval routing (PRD §4, §5.2, §7.1).

`User` is a lean account/org-identity record for **every** role. `EmployeeProfile` (one per
FIELD `User`, created lazily on first onboarding update) and `ComplianceBlock` (one row per block
**event**, not a single overwritable field) are split out — see `docs/decision-log.md`,
2026-09-23 — specifically because both carry data that's either FIELD-only
(`EmployeeProfile`) or open-ended and growing (`ComplianceBlock`), and mixing either into the
same record as auth-critical fields (`password_hash`, `role_id`) was the coupling worth avoiding
before real data existed.

## Diagram

```mermaid
erDiagram
    ROLE {
        uuid id PK
        string name UQ "ADMIN, HR, ACCOUNTANT, FIELD"
    }
    DESIGNATION {
        uuid id PK
        string name "MR, ASM, RSM, ZSM, NSM"
        int level "rank in the chain, fixed by the name: MR 1, ASM 2, RSM 3, ZSM 4, NSM 5 (derived, not entered)"
    }
    PAY_BAND {
        uuid id PK
        string name "free text up to 20 chars, unique ignoring case (name_key): G1, G2 ... Trainee"
        int ta_per_km_rate_paise "paise per km - feeds auto TA calculation - see HLD 06"
        int hq_da_paise "DA when the day's Route type is HQ - see HLD 06"
        int ex_station_da_paise "DA for EX_STATION routes"
        int out_station_da_paise "DA for OUT_STATION routes"
    }
    USER {
        uuid id PK
        string employee_code UQ
        string name
        string email UQ "nullable - not required for a FIELD user at creation"
        string phone
        string status "active, pending, inactive - pending = FIELD onboarding incomplete"
        uuid role_id FK
        string password_hash
        timestamp last_login_at
        boolean is_blocked "default false - see HLD 10, compliance block; historical detail is in COMPLIANCE_BLOCK, not here"
    }

    EMPLOYEE_PROFILE {
        uuid id PK
        uuid user_id FK UQ "one profile per FIELD User - created lazily on first onboarding PATCH"
        uuid designation_id FK "nullable"
        uuid pay_band_id FK "nullable"
        uuid manager_id FK "self-referencing to USER, nullable - null = top of chain, required for FIELD activation"
        date date_of_joining "nullable"
        int probation_months "nullable, 0-36; null = PROBATION_MONTHS setting"
        string esi_number "nullable, exactly 17 digits - printed on the salary slip"
        string mobile_number "nullable - onboarding basic details"
        string guardian_name "nullable, optional - not required for activation"
        date date_of_birth "nullable - onboarding basic details"
        string qualification "nullable, optional - not required for activation"
        json address "nullable - {district, state, pincode, country}, country default India"
        json bank_details "nullable - {bank_name, ifsc, account_number, account_holder_name, branch_name}"
        json documents "array - [{id, type, url, publicId, uploadedAt}], uploaded to Cloudinary"
    }

    COMPLIANCE_BLOCK {
        uuid id PK
        uuid user_id FK "one row per block EVENT - a user can have many over their tenure"
        string reason "e.g. DCR_MISSED_NO_LEAVE"
        timestamp blocked_at
        uuid unblocked_by FK "nullable, references USER - must be an ADMIN user; null while still open"
        timestamp unblocked_at "nullable - null = still open (this is the user's current block)"
    }

    USER_SESSION {
        uuid id PK
        uuid user_id FK
        string device_id "unique per device"
        string device_name "e.g. Redmi Note 12"
        string device_model
        string platform "ANDROID, IOS, WEB"
        string refresh_token_hash
        timestamp issued_at
        timestamp expires_at
        timestamp last_active_at
        timestamp revoked_at "nullable - null = active"
        string revoked_reason "nullable - ROTATED, LOGOUT, ADMIN, PASSWORD_RESET, THEFT"
    }
    USER_DEVICE {
        uuid id PK
        uuid user_id FK "FIELD users only"
        string device_id "ANDROID_ID from the app"
        string device_name
        string device_model
        string platform
        string status "PENDING, REGISTERED, REJECTED, REMOVED"
        timestamp requested_at
        timestamp decided_at "nullable"
        uuid decided_by FK "nullable - the Admin"
        timestamp expires_at "nullable - set on REJECTED, TTL-deleted after"
    }

    ROLE ||--o{ USER : "role_id (required)"
    USER ||--o| EMPLOYEE_PROFILE : "user_id (FIELD only, lazily created)"
    DESIGNATION |o--o{ EMPLOYEE_PROFILE : "designation_id (optional)"
    PAY_BAND |o--o{ EMPLOYEE_PROFILE : "pay_band_id (optional)"
    USER |o--o{ EMPLOYEE_PROFILE : "manager_id (reports to, optional)"
    USER ||--o{ COMPLIANCE_BLOCK : "block history"
    USER |o--o{ COMPLIANCE_BLOCK : "unblocked_by (Admin, optional)"
    USER ||--o{ USER_SESSION : "device sessions"
    USER ||--o{ USER_DEVICE : "approved phones (FIELD)"
```

## Onboarding (added 2026-09-23, revised 2026-09-23, `docs/decision-log.md`)

A FIELD `User` is created with minimal fields (`employee_code`, `name`, `password`) and starts
`status: pending`. No `EmployeeProfile` row exists yet at this point — creation only ever writes
`User`. An Admin/HR fills the rest in incrementally via `PATCH` — personal details, bank details,
`designation_id`/`pay_band_id`/`manager_id`/`date_of_joining`, and uploaded documents (Cloudinary)
— which upserts the `EmployeeProfile` row into existence on the first call. `status` recomputes to
`active` automatically the moment every required field is present: `name` (on `User`),
`mobile_number`, `date_of_birth`, a complete `address`, `designation_id`, `pay_band_id`,
`manager_id`, and the bank details needed to actually pay someone (`bank_name`/`ifsc`/
`account_number`/`account_holder_name`) — all on `EmployeeProfile`. `guardian_name`,
`qualification`, `bank_details.branch_name`, `documents`, and `date_of_joining` are **not**
required for activation. An `inactive` (deactivated/offboarded) `User` is never auto-upgraded back
to `active`/`pending` by this recomputation — deactivation is a separate, explicit action.

An `ADMIN`/`HR`/`ACCOUNTANT` `User` (the "user master" creation path) skips onboarding entirely —
`status: active` immediately, and never gets an `EmployeeProfile` row at all, since designation/
pay-band/manager/joining-date/bank/documents don't apply to those roles.

Since 2026-10-09 a new FIELD employee is added through a wizard backed by an `EmployeeDraft`
(`created_by`, `step`, `data` per wizard step, `created_user_id` once the login exists) that is
turned into the real records by one "finalize" call, so a `User` and its `GRN` code appear only at
the end. `EmployeeProfile` also holds `alternate_mobile`, `permanent_address` /
`permanent_same_as_present`, `qualifications[]` (degree, institute, year) and `previous_employment[]`
(company, joining date, end date); an address has `line1`/`line2`. A `counters` document (`_id:
employeeCode`, `seq`) numbers the codes. `manager_id` is required for `active` unless the
designation is the highest level that exists. The wizard also sets the employee's HQ
(`UserHqAssignment`, Territory) as it creates them; the status rule does not depend on it.

## Design decisions locked for this module

- **Designation, Pay Band, manager, and joining date are field-force only, and live on `EmployeeProfile`, not `User`.** All four apply to `FIELD` employees only — `ADMIN`/`HR`/`ACCOUNTANT` never get an `EmployeeProfile` row at all, so there's nothing to leave null for them. This also means **Payroll (Module 9) only processes FIELD-role employees** — Admin/HR/Accountant salary and joining date are assumed handled by a separate, external company payroll system outside this SFA tool. `ta_per_km_rate` and the three DA rates (`hq_da`/`ex_station_da`/`out_station_da`) are all figures per grade, not individually negotiated per user — matching PRD §5.2's "same designation, different Pay Band, different rates" logic.
- **Single-manager tree, not a matrix.** One self-referencing `EmployeeProfile.manager_id` (pointing at another `User`) is enough — matches the MR → ASM → RSM → ZSM → NSM chain and is exactly what the approval routing in PRD §7.1 walks (nearest higher manager approves, everyone above that is read-only).
- **No separate Team table.** A manager's team, and the read-only-visibility set for higher managers, are both derived by recursively walking `EmployeeProfile.manager_id` — storing that separately risks it drifting out of sync with reality.
- **One auth mechanism.** `password_hash` is shared by every role, web and mobile alike. mPIN was considered for field-force mobile login and dropped — not needed.
- **Access tokens are stateless (short-lived JWTs) — not persisted.** Only refresh tokens are stored, one row per logged-in device, in `UserSession`. This is also what makes per-device revocation and the device-count limit possible.
- **Device limit: FIELD role only, enforced on registered phones, not logins.** Every new phone a field employee uses becomes a `UserDevice` row in `PENDING` and needs Admin approval (the first one too). The limit (`MAX_REGISTERED_DEVICES_FIELD`, default `2`, in `SystemConfig`) counts `PENDING` + `REGISTERED` rows; at the limit a new phone is refused outright and no request is created. Logging out never frees a slot, only Admin removing a phone does. A rejected phone is blocked until `expires_at` (`REJECTED_DEVICE_TTL_DAYS`, default `7`), then a TTL index deletes the row. Web-portal roles (Admin/HR/Accountant) have no registry and no limit. Replaced the earlier "count active sessions, block with 'log out from another device first'" rule on 2026-09-24, `docs/decision-log.md`.
- **Compliance block history is its own append-only collection (`ComplianceBlock`), not overwritable fields on `User`.** A background job (HLD 10) creates a new `ComplianceBlock` row (`reason`, `blocked_at`) and sets `User.is_blocked = true` — there's no `blocked_by` on the row, since no person initiates it. `User.is_blocked` stays as a fast top-level flag for querying ("list currently-blocked users"); the row is where the reason and timestamps actually live, one per block **event**, so a second block later in the same employee's tenure doesn't silently erase the first. Retention is indefinite — no TTL/auto-expiry — matching how the rest of the system treats history (HLD 9's Financial-Year toggle only ever scopes what's *shown*, never deletes). Clearing a block (`unblocked_by`/`unblocked_at` on the open row, plus `User.is_blocked = false`) is restricted to an `ADMIN`-role user, never the Nearest Manager, even though the Nearest Manager is otherwise the Stage 1 approver for everything this user submits (PRD §7.1) — a deliberate carve-out because the block is punitive/compliance-driven, not a routine approval. Closing the row and flipping the flag happen in one transaction — the first in this codebase — since either happening without the other would leave the two disagreeing.

- **CTC is per employee, split by one org-wide formula (2026-10-05, `docs/decision-log.md`).** `PayComponent` (the formula: `code`, `kind` EARNING / EMPLOYER_CONTRIBUTION, a rule of percent-of-CTC / percent-of-components / fixed / balancer, `order`, `is_active`) and `CtcAssignment` (`user_id`, `ctc_annual_paise`, `effective_from` `YYYY-MM`, frozen `lines`, `overrides`, `reason`, `created_by`, `created_at`) — append-only, no edits; the revision in force for a month is the latest `effective_from` not after it. A grade holds no CTC range (removed 2026-10-06): the CTC is independent of the grade, and a rise of more than `CTC_JUMP_WARN_PERCENT` over the previous revision only warns; `PayBand.base_salary` is gone: Payroll reads the CTC.
- **Promotion and manager history (2026-10-06).** `PROMOTION` (`user_id`, `effective_from` `YYYY-MM`, `status`, `from_/to_designation_id`, `from_/to_pay_band_id`, `from_/to_manager_id` (null `to_` = unchanged), `ctc` (amount + overrides, saved as a CTC revision when applied), `team_moves[]` (`user_id`, `to_manager_id`), `reason`, `created_by`, `ctc_assignment_id`, `applied_at`, `cancelled_at`); at most one `SCHEDULED` per user. `MANAGER_CHANGE` (`user_id`, `manager_id`, `previous_manager_id`, `effective_from` `YYYY-MM`, `source`, `promotion_id`, `created_by`, `created_at`), append-only: the manager in force for a month is the latest change not after it, or `previous_manager_id` of the first change before it.

## Next

**Module 2 — Territory Master.** Zone → HQ → Route will add a territory FK (e.g. `hq_id` or
`route_id`) onto `EmployeeProfile` (not `User` — the FK would be FIELD-only, same as
`designation_id`/`pay_band_id`), plus Route → Doctor/Chemist assignment. Route assignment itself
(`ROUTE_ASSIGNMENT`, ERD-02) should validate its target `user_id` resolves to a `FIELD`-role user
via Identity's `isFieldRole` contract method — the same pattern already used elsewhere for
FIELD-only checks.
