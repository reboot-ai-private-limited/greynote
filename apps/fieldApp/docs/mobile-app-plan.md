# Field App — Flow, Roadmap & Screens

The field-force mobile app (`apps/fieldApp`, Expo + React Native) for Medical Representatives (MR)
and managers (ASM → RSM → ZSM → NSM). This is the working plan for Phase 10 of
[`roadmap.md`](../../../docs/roadmap.md). Product rules live in [`prd.md`](../../../docs/prd.md) §6–§8; the offline design is
[`hld/01-sync-and-geofencing.md`](../../../docs/hld/01-sync-and-geofencing.md) and
[`LLD/sync.md`](../../../docs/LLD/sync.md); gating is
[`hld/10-submission-gating-and-compliance-block.md`](../../../docs/hld/10-submission-gating-and-compliance-block.md).

Last updated 2026-10-07. Day counts are estimates for one experienced developer.

---

## 1. Where we are today

| Area | State |
|---|---|
| Screens built | Splash, Login, Device Status, 4-tab shell (Home / Docs / Reports / Team — placeholders) |
| Login | **Connected** to `POST /api/identity/auth/login`; tokens kept in secure storage; device-approval refusals route to Device Status |
| Stage 0 | **Done 2026-10-07:** session restore on launch, authenticated API client with single-flight token refresh, logout + Profile screen, `/auth/me` load, signed-out redirect, tablet-ready layout (centred max-width, all orientations, `useResponsive`) |
| Stage 1 | **Built and phone-tested 2026-10-07 (pull, push refusal, offline banner, backup, cold restart; the SYNCED push path still needs an employee with a route):** `src/offline/` — SQLite store (memory on web), outbox, pull / push / draft backup / restore against `/sync/*`, on-device geofence (matches the server on 20,000 random cases), connectivity hook, offline banner, sync chip on Home. |
| Stage 2 | **Built 2026-10-07:** Home with the four tile sections (21 tiles), a today card showing the Tour Plan status, tiles locked by the day gate (plan approved, account unblocked — logic in `offline/day.ts`, checked on 11 cases) with a tap-to-explain message, a placeholder screen per tile (`/feature/[key]`), responsive 2/3-column grid. Seen on a real phone for a FIELD user with no plan; the **approved-plan and blocked states are not yet seen on a phone**. |
| Stage 3 | **Built 2026-10-07:** Daily Plan (date chips, working type, routes, remarks; save / submit / withdraw; in-day change request) and Monthly Plan (day list, fill-all, weekly off skipped; save / submit / withdraw). Save and Submit need a connection, so offline the form is kept on the phone. Tested on a real phone against the real API: daily and monthly submit and withdraw, offline notice. **Not built:** the Work With picker (no endpoint lists colleagues for an MR) and a late-submission screen (those exceptions are *granted* by a manager or Admin, so they belong to the Team tab, Stage 5). **Not tested:** the route picker with real routes (EMP03 has none), approval, rejection reason, and the in-day change request. |
| Stage 4 (done) | **Built 2026-10-08, phone-tested end to end (online, offline, a refused record and its retry):** Dr Call and Chemist Call (picker limited to today's plan routes, samples capped by allocation, GPS and on-device geofence, drafts on the phone), Dr and Chemist Followup, Expenses (rupees typed, whole paise stored; TA and DA never entered), Add Doctor (route, name, address, speciality, qualification, optional email; location is the phone's GPS, no map; works offline and sends on its own; approved by manager then Admin; Change, Withdraw and rejection reason; phone-tested), Leave (balances from the last sync, request, change and resend, withdraw; proof files attached on the request form or afterwards — PDF/JPG/PNG, 5 MB, 3 files; online only; phone-tested), Summary and Final Submission (queues the day, sends in order, shows a refused record with its reason). All of it reached the manager in the web portal. **Known gaps:** the phone re-checks the server only on start, foreground and reconnect; a deactivated doctor or chemist shows as "Unknown" in the Summary; the Work With picker waits on the colleagues endpoint. |
| Not done | `isManager` flag, designation name, every Home / Docs / Reports / Team screen, the offline store and sync |
| Backend | Complete for all modules (Phases 0–8 of the roadmap); the gaps the app needs are listed in §7 |

---

## 2. End-to-end flow (one field day)

```
Launch ─► Splash ─► has valid session? ──no──► Login ──► (device pending/rejected/limit) ─► Device Status
              │                                   │
             yes                                  ▼ success
              └──────────────────────────────► Home (tabs)
                                                   │
 ┌─────────────────────────────────────────────────┘
 │
 ▼  MORNING
 Daily Plan (pick date, working type, work-with, routes)
   └─ Submit (needs internet) ─► manager approves in Team tab ─► Plan APPROVED
 │
 ▼  DURING THE DAY (gated: needs today's Plan approved and account not blocked)
 Dr Call ──► GPS captured on device ──► saved to local queue (offline OK)
 Chemist Call / Followups / Add Doctor / Expenses / Orders / Stock counts ──► same local queue
 │
 ▼  END OF DAY
 Summary ─► Final Submission (needs internet)
   └─ pushes the queue in dependency order ─► DCR goes to manager as an approval request
 │
 ▼  AFTER
 Manager approves ─► Admin ─► Accountant pays TA/DA ─► Payroll
```

**Approval path (PRD §7):** employee → nearest higher manager (acts in the Team tab) → Admin.
Managers further up the chain see it read-only. The top of the chain goes straight to Admin.

**Blocked state:** if DCRs go unsubmitted past `DCR_MISS_GRACE_DAYS` with no approved leave, the
account is blocked from plans, calls and expenses. Leave requests still work.

---

## 3. Navigation map

```
Splash
Login ─► Device Status
(tabs)
├─ Home
│   ├─ DCR:        Daily Plan · Monthly Plan · Dr Call · Dr Followup · Chemist Call
│   │              · Chemist Followup · Add Doctor · Expenses · Leave · Summary & Final Submission
│   ├─ Marketing:  Orders · Monthly Stock · Visuals · Campaigns · Targets · Gifts · Services
│   ├─ Resources:  → Docs tab
│   └─ Utility:    Holidays · Forms · Financial-Year switch
├─ Docs      (resource library)
├─ Reports   (DCR · Tour Plan · Gift & Sales)
└─ Team      (managers only: Inbox · Team activity · Request detail)
```

---

## 4. Build roadmap (step by step)

Order is by dependency: nothing in a later stage works without the earlier one.

### Stage 0 — Finish the session layer (3–4 days) — **done**
Login is wired; the rest of the session isn't.
1. Splash: read the refresh token → `POST /identity/auth/refresh` → `/(tabs)` or `/login`.
2. Authenticated API client: attach the access token, refresh on 401 once, sign out if refresh fails.
3. Logout (`POST /identity/auth/logout`) with a profile/menu entry point.
4. Replace the mock user: load `GET /identity/auth/me`; add the backend gaps in §7.
5. Global states: no-connection banner, server-error screen, blocked-account banner.

**Done when:** killing and reopening the app keeps you signed in; logout returns to Login;
a revoked session lands on Login.

### Stage 1 — Offline foundation (6–8 days) — *the riskiest stage* — **built 2026-10-07, needs a real-device test**
1. Choose the local store (SQLite + a thin repository layer; see `../../../docs/engineering/tech-choices.md`).
2. Local tables: `outbox` (clientId, kind, payload, status `DRAFT→QUEUED→SYNCED/FAILED`, dependsOn) plus cache tables for routes, doctors, chemists, products, holidays, leave balances.
3. Reference-data pull: `GET /sync/pull` into the cache on login and on pull-to-refresh.
4. Push engine: `POST /sync/push` in dependency order, per-record results, retry, failure surface.
5. Draft backup: `PUT/GET /sync/drafts`.
6. On-device geofence check (Haversine) before a call is saved; a FAIL flags the record, never blocks it.
7. Connectivity hook (`online`, `lastSyncAt`) used by every Submit button.

**Done when:** airplane-mode create → reconnect → records appear on the server exactly once.

### Stage 2 — Home shell and gating (2–3 days) — **built 2026-10-07, phone-tested**
1. Home with the four quadrants and tile grid.
2. Gate state hook: "may I log today?" = today's Plan approved ∧ not blocked; disabled tiles explain why.
3. Header: user name, designation, sync status chip.

### Stage 3 — Planning (3–4 days) — **built 2026-10-07, phone-tested**
Daily Plan, Monthly Plan, in-day change request, late-submission grant request. See §5.

### Stage 4 — Daily call report (12–14 days)
Dr Call, Dr Followup, Chemist Call, Chemist Followup, Add Doctor, Expenses, Leave,
Summary & Final Submission. See §5.

### Stage 5 — Team approvals (3–4 days)
Inbox, team activity, request detail, approve/reject, bulk. Built early enough to test Stage 3–4
end to end with two test accounts.

### Stage 6 — Marketing (7–8 days)
Orders, Monthly Stock, Visuals, Campaigns, Targets, Gifts, Services.

### Stage 7 — Docs, Utility, Reports (6–7 days)
Resource library, Holidays, Forms, Financial-Year switch, three reports.

### Stage 8 — Hardening and release (7–10 days)
Real-device pass (GPS accuracy, offline, low memory), development build, error handling pass,
accessibility, performance, app icon/splash, EAS build, store listing.

**Total:** about 50–60 working days solo (30–40 with heavy AI assistance).

Suggested order if two people work in parallel: one on Stage 0–1 (foundation), one on screens
against mock data (Stages 2–7), merging once the outbox exists.

---

## 5. Screens, step by step

Legend — **Status:** ✅ built · 🔌 built + connected · ⬜ to build. **Net:** needs internet at tap
time (online-only) vs **Queue:** saves locally and syncs later.

### 5.1 Auth

| # | Screen | Status | Purpose | Backend |
|---|---|---|---|---|
| 1 | Splash | ✅ (no session check) | Restore session, route to Login or tabs | `POST /identity/auth/refresh` |
| 2 | Login | 🔌 | Employee code + password; device fields sent automatically | `POST /identity/auth/login` |
| 3 | Device Status | ✅ | Pending / rejected / limit-reached explanation | reason from the login response |

### 5.2 Home → DCR

| # | Screen | Net | Fields and rules | Backend |
|---|---|---|---|---|
| 4 | Daily Plan | Submit: online · Save: offline | Date (Today / Tomorrow / calendar), working type (Field Work, Meeting, Conference, Strike), work-with (multi), routes, remarks. Submit deadline from Config (default 10:00). | `GET /territory/my-routes`, `POST /planning/daily`, `POST …/:id/submit`, `GET /planning/daily` |
| 5 | Plan change (in-day) | online | Request a change to an approved Daily Plan | `POST /planning/daily/:id/changes`, `GET …/changes` |
| 6 | Monthly Plan | Submit: online | Day-by-day plan for next month; deadline the 28th | `POST /planning/monthly`, `POST …/:id/submit` |
| 7 | Late-submission request | online | Ask for a one-off exception after a missed deadline | `POST /planning/late-grants` |
| 8 | Dr Call (list + new) | Queue | Doctor, working type, work-with, remarks, samples (product + qty, limited to the doctor's allocation), GPS captured on save | sync kind `DOCTOR_CALL`; cache from `GET /sync/pull` |
| 9 | Dr Followup | Queue | Doctor + remarks | sync kind `DOCTOR_FOLLOWUP` |
| 10 | Chemist Call (list + new) | Queue | Chemist, working type, work-with, remarks, GPS | sync kind `CHEMIST_CALL` |
| 11 | Chemist Followup | Queue | Chemist + remarks | sync kind `CHEMIST_FOLLOWUP` |
| 12 | Add Doctor | Queue | Category, name, address, email, specialty, qualification, map location, route | `GET/POST/PUT /field-master-data/doctors/added`, kind `NEW_DOCTOR` (goes to approval) |
| 13 | Expenses | Queue | Type (Travel/Meal/Misc), amount in whole paise. TA/DA are computed by the server and never entered. | sync kind `EXPENSE` |
| 14 | Leave — balances + requests | Request: online | Balances by leave type, request with attachments, status | `GET /hr/leave-balances/me`, `POST /hr/leaves`, `GET /hr/leaves/me`, `PUT /hr/leaves/:id`, `POST /hr/leaves/:id/attachments`, withdraw via `POST /approvals/:id/withdraw` |
| 15 | Summary & Final Submission | Submit: online | Everything for the day in one view; failed records block the submit | sync kind `DCR_SUBMIT` (depends on every record of the day) |

### 5.3 Home → Marketing

| # | Screen | Net | Purpose | Backend |
|---|---|---|---|---|
| 16 | Orders (list + new + detail) | Queue | Chemist/Distributor order by product, Placed → Done/Cancelled | kind `ORDER`, `GET /sales/orders`, `…/:id`, `POST …/complete`, `POST …/cancel` |
| 17 | Monthly Stock | Queue | Opening/closing counts per outlet and product; locked after month end | kind `MONTHLY_STOCK`, `GET /sales/monthly-stock`, `…/missing` |
| 18 | Visuals | online, cached | E-detailing visuals, optionally per product | `GET /marketing/visuals` |
| 19 | Campaigns | online, cached | Company campaigns | `GET /marketing/campaigns` |
| 20 | Targets | online | Own target; for managers the sum of the downline | `GET /marketing/targets/:userId`, `POST /marketing/targets` |
| 21 | Doctor Gifts | Queue | Admin-allocated gifts; MR marks Done | `GET /field-activity/doctor-gifts`, kind `GIFT_DONE` |
| 22 | Doctor Services | Queue | Request a service (Tour Package, Gift, Online Promotion, Others) + amount; goes to approval | `GET /field-activity/doctor-services`, kind `DOCTOR_SERVICE` |

### 5.4 Docs and Utility

| # | Screen | Purpose | Backend |
|---|---|---|---|
| 23 | Docs (Resources library) | Price lists, literature, training | **No endpoint yet — see §7** |
| 24 | Holiday List | National / Zone / HQ holidays; weekly off day is a rule, not a row | `GET /hr/holidays` |
| 25 | Forms | Links to standard company forms | **No endpoint yet — see §7** |
| 26 | Financial-Year switch | Time-machine to a past FY; past years are read-only (header `X-Financial-Year`) | `GET /config/financial-year` |

### 5.5 Reports tab

| # | Screen | Purpose | Backend |
|---|---|---|---|
| 27 | DCR Report | Past daily call reports, with status | `GET /field-activity/dcr`, `…/:id` |
| 28 | TP Report | Tour Plan status (Pending / Approved) | `GET /planning/daily`, `/monthly` |
| 29 | Gift & Sales Report | Samples given, primary/secondary sales | `GET /sales/orders`, `…/monthly-stock`, `/field-activity/doctor-gifts` (assembled client-side) |

### 5.6 Team tab (managers only)

| # | Screen | Purpose | Backend |
|---|---|---|---|
| 30 | Approvals Inbox | Direct reports' requests; approve/reject, bulk | `GET /approvals/inbox`, `POST …/:id/approve`, `…/reject`, `POST /approvals/bulk` |
| 31 | Team Activity | Whole downline, read-only past direct reports | `GET /approvals/team`, `GET /field-activity/dcr/team` |
| 32 | Request Detail | Full request with history; reject needs a comment; geofence override on a flagged call | `GET /approvals/:id`, `POST /field-activity/dcr/:id/calls/:callId/override-geofence` |
| 33 | My Requests | Status of my own submissions, withdraw | `GET /approvals/mine`, `POST …/:id/withdraw` |

### 5.7 Shared pieces

Profile / menu with logout (⬜), Blocked-account screen (⬜), Sync status sheet with failed records
and retry (⬜), No-connection banner (⬜), Empty and error states (⬜).

**Count:** 3 auth + 12 DCR + 7 marketing + 4 docs/utility + 3 reports + 4 team = **33 screens**,
plus ~5 shared pieces. (`apps/fieldApp/CLAUDE.md` mentions about 44 once list/detail variants are
counted separately.)

---

## 6. Screen build checklist (apply to every screen)

1. Read the PRD section and the LLD for the module.
2. Decide: **online-only** or **queue**. Plan Submit, DCR Final Submission and Leave request are online-only; calls, followups, expenses, orders and stock are queued.
3. Build against mock data first, then wire to the API.
4. Handle the five states: loading, empty, error, offline, gated/blocked.
5. Money is integer paise end to end; never send TA/DA.
6. Client-generated UUID for every queued record.
7. Read the user only through `useCurrentUser()`.
8. `npx tsc --noEmit` and `npx expo lint` pass before it counts as done.

---

## 7. Backend gaps to close (small, but they block screens)

| Gap | Blocks |
|---|---|
| `isManager` / "has direct reports" flag on the user (login response or `/auth/me`) | Team tab visibility |
| Designation **name** (login gives only `designationId`) | Home header, Team labels |
| ~~A list of colleagues an MR can pick for Work With~~ — added 2026-10-07: `GET /identity/colleagues` | done |
| Resource library endpoint (list/download documents) | Docs tab (#23) |
| Company forms endpoint or a config of links | Forms (#25) |
| CORS: add `http://localhost:8081` for web testing | Testing in the browser |
| Reports: no dedicated aggregate endpoints | #29 is assembled client-side; fine for now |

---

## 8. Test plan

- **Per screen:** the checklist in §6.
- **Two accounts:** one MR, one ASM, so Plan → approve → call → Final Submission → approve is run for real.
- **Offline script:** airplane mode through a full day, reconnect, verify exactly-once on the server.
- **Edge cases:** blocked account, unapproved Plan, geofence FAIL, rejected device, expired refresh token, a record that fails server validation, duplicate push after a timeout.
- **Devices:** one low-end Android, one iPhone; Expo Go for UI, a development build for GPS and background behavior.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Offline sync conflicts and partial failure | Build and test Stage 1 first; client UUIDs make pushes idempotent |
| GPS accuracy indoors | Server treats a missing/poor fix as `UNVERIFIED`, not `FAIL` |
| Expo Go can't do every native feature | Move to a development build when background GPS or a native DB is needed |
| Backend gaps (§7) found late | Close them in Stage 0 |
| Store review time | Start the store listing during Stage 7 |
