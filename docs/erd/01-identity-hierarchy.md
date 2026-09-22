# Module 1: Identity & Hierarchy

Covers: `Role`, `Designation`, `PayBand`, `User` — and the self-referencing reporting chain that drives approval routing (PRD §4, §5.2, §7.1).

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
        string email UQ
        string phone
        string status "active, inactive"
        date date_of_joining
        uuid role_id FK
        uuid designation_id FK "nullable - FIELD role only"
        uuid pay_band_id FK "nullable - FIELD role only"
        uuid manager_id FK "self-referencing, nullable - null = top of chain"
        string password_hash
        timestamp last_login_at
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
    DESIGNATION |o--o{ USER : "designation_id (optional)"
    PAY_BAND |o--o{ USER : "pay_band_id (optional)"
    USER |o--o{ USER : "manager_id (reports to, optional)"
    USER ||--o{ USER_SESSION : "device sessions"
```

## Design decisions locked for this module

- **Designation & Pay Band are field-force only.** Both FKs on `User` are nullable and stay `null` for `ADMIN`/`HR`/`ACCOUNTANT` — those roles don't carry a field rank or comp grade in this system. This also means **Payroll (Module 9) only processes FIELD-role employees** — Admin/HR/Accountant salary is assumed handled by a separate, external company payroll system outside this SFA tool. `PayBand.base_salary`, `ta_per_km_rate`, and `da_amount` are all flat figures per grade (G1/G2/G3), not individually negotiated per user — matching PRD §5.2's "same designation, different Pay Band, different rates" logic.
- **Single-manager tree, not a matrix.** One self-referencing `manager_id` is enough — matches the MR → ASM → RSM → ZSM → NSM chain and is exactly what the approval routing in PRD §7.1 walks (nearest higher manager approves, everyone above that is read-only).
- **No separate Team table.** A manager's team, and the read-only-visibility set for higher managers, are both derived by recursively walking `manager_id` — storing that separately risks it drifting out of sync with reality.
- **One auth mechanism.** `password_hash` is shared by every role, web and mobile alike. mPIN was considered for field-force mobile login and dropped — not needed.
- **Access tokens are stateless (short-lived JWTs) — not persisted.** Only refresh tokens are stored, one row per logged-in device, in `UserSession`. This is also what makes per-device revocation and the device-count limit possible.
- **Device limit: FIELD role only, hard-blocked at login.** A field employee logging in on a device beyond the limit gets an explicit "log out from another device first" rejection — no silent auto-kick of an older session. Web-portal roles (Admin/HR/Accountant) have no device limit. The limit value itself (`MAX_ACTIVE_DEVICES_FIELD`, default `2`) lives in the `SystemConfig` rule table (Module 5), not hardcoded here — enforced by counting a user's `UserSession` rows where `revoked_at IS NULL AND expires_at > now()`.

## Next

**Module 2 — Territory Master.** Zone → HQ → Route will add a territory FK (e.g. `hq_id` or `route_id`) onto `User`, plus Route → Doctor/Chemist assignment.
