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
        int level "rank order, used to validate the reporting chain"
    }
    PAY_BAND {
        uuid id PK
        string name "G1, G2, G3"
        decimal base_salary "monthly base salary for this grade - feeds Payroll (Module 9)"
        decimal ta_per_km_rate "feeds auto TA calculation - see HLD 06"
        decimal da_amount "flat daily allowance - feeds auto DA calculation - see HLD 06"
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
    }

    ROLE ||--o{ USER : "role_id (required)"
    USER ||--o| EMPLOYEE_PROFILE : "user_id (FIELD only, lazily created)"
    DESIGNATION |o--o{ EMPLOYEE_PROFILE : "designation_id (optional)"
    PAY_BAND |o--o{ EMPLOYEE_PROFILE : "pay_band_id (optional)"
    USER |o--o{ EMPLOYEE_PROFILE : "manager_id (reports to, optional)"
    USER ||--o{ COMPLIANCE_BLOCK : "block history"
    USER |o--o{ COMPLIANCE_BLOCK : "unblocked_by (Admin, optional)"
    USER ||--o{ USER_SESSION : "device sessions"
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

Zone/HQ assignment is **not** part of this onboarding flow — see "Next" below; it lands with
Territory (Module 2), one tier above Identity, not here.

## Design decisions locked for this module

- **Designation, Pay Band, manager, and joining date are field-force only, and live on `EmployeeProfile`, not `User`.** All four apply to `FIELD` employees only — `ADMIN`/`HR`/`ACCOUNTANT` never get an `EmployeeProfile` row at all, so there's nothing to leave null for them. This also means **Payroll (Module 9) only processes FIELD-role employees** — Admin/HR/Accountant salary and joining date are assumed handled by a separate, external company payroll system outside this SFA tool. `PayBand.base_salary`, `ta_per_km_rate`, and `da_amount` are all flat figures per grade (G1/G2/G3), not individually negotiated per user — matching PRD §5.2's "same designation, different Pay Band, different rates" logic.
- **Single-manager tree, not a matrix.** One self-referencing `EmployeeProfile.manager_id` (pointing at another `User`) is enough — matches the MR → ASM → RSM → ZSM → NSM chain and is exactly what the approval routing in PRD §7.1 walks (nearest higher manager approves, everyone above that is read-only).
- **No separate Team table.** A manager's team, and the read-only-visibility set for higher managers, are both derived by recursively walking `EmployeeProfile.manager_id` — storing that separately risks it drifting out of sync with reality.
- **One auth mechanism.** `password_hash` is shared by every role, web and mobile alike. mPIN was considered for field-force mobile login and dropped — not needed.
- **Access tokens are stateless (short-lived JWTs) — not persisted.** Only refresh tokens are stored, one row per logged-in device, in `UserSession`. This is also what makes per-device revocation and the device-count limit possible.
- **Device limit: FIELD role only, hard-blocked at login.** A field employee logging in on a device beyond the limit gets an explicit "log out from another device first" rejection — no silent auto-kick of an older session. Web-portal roles (Admin/HR/Accountant) have no device limit. The limit value itself (`MAX_ACTIVE_DEVICES_FIELD`, default `2`) lives in the `SystemConfig` rule table (Module 5), not hardcoded here — enforced by counting a user's `UserSession` rows where `revoked_at IS NULL AND expires_at > now()`.
- **Compliance block history is its own append-only collection (`ComplianceBlock`), not overwritable fields on `User`.** A background job (HLD 10) creates a new `ComplianceBlock` row (`reason`, `blocked_at`) and sets `User.is_blocked = true` — there's no `blocked_by` on the row, since no person initiates it. `User.is_blocked` stays as a fast top-level flag for querying ("list currently-blocked users"); the row is where the reason and timestamps actually live, one per block **event**, so a second block later in the same employee's tenure doesn't silently erase the first. Retention is indefinite — no TTL/auto-expiry — matching how the rest of the system treats history (HLD 9's Financial-Year toggle only ever scopes what's *shown*, never deletes). Clearing a block (`unblocked_by`/`unblocked_at` on the open row, plus `User.is_blocked = false`) is restricted to an `ADMIN`-role user, never the Nearest Manager, even though the Nearest Manager is otherwise the Stage 1 approver for everything this user submits (PRD §7.1) — a deliberate carve-out because the block is punitive/compliance-driven, not a routine approval. Closing the row and flipping the flag happen in one transaction — the first in this codebase — since either happening without the other would leave the two disagreeing.

## Next

**Module 2 — Territory Master.** Zone → HQ → Route will add a territory FK (e.g. `hq_id` or
`route_id`) onto `EmployeeProfile` (not `User` — the FK would be FIELD-only, same as
`designation_id`/`pay_band_id`), plus Route → Doctor/Chemist assignment. Route assignment itself
(`ROUTE_ASSIGNMENT`, ERD-02) should validate its target `user_id` resolves to a `FIELD`-role user
via Identity's `isFieldRole` contract method — the same pattern already used elsewhere for
FIELD-only checks.
