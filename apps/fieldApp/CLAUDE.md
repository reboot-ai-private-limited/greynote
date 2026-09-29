# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this app is

`fieldApp` is the field-force mobile app for **Greynote**, a pharmacy Sales Force Automation
platform — offline-first daily call reporting (DCR), tour planning, TA/DA expenses, and
hierarchical approvals for Medical Representatives and their managers. It's one of three apps in
the `pharmaCRM` monorepo (`apps/api` Express backend, `apps/web` Next.js admin portal — not yet
scaffolded, `apps/fieldApp` this app). Full product/architecture context lives two levels up:

- `../../CLAUDE.md` — whole-repo architecture, module boundaries, backend conventions
- `../../docs/prd.md` — the product spec: personas, the 4-tab nav (Home/Docs/Reports/Team),
  every screen's fields and rules
- `../../docs/roadmap.md` — build order; **the mobile app is Phase 10**, meant to start after
  Phase 6 (Field Activity) works end to end — see "Current state" below for what that means today
- `../../docs/hld/01-sync-and-geofencing.md` — the offline queue and GPS-check design this app
  must implement (client-generated UUIDs, `DRAFT → QUEUED → SYNCED/FAILED`, on-device Haversine
  check before sync)
- `../../docs/hld/10-submission-gating-and-compliance-block.md` — why several screens must be
  disabled until the day's Tour Plan is manager-approved, and the account-blocked state

Read `docs/prd.md` §6 before building any screen — it's the actual spec for what each one does.

## Current state (check before assuming a screen or API call works)

**This is currently the unmodified `create-expo-app` template** (`src/app/index.tsx`,
`explore.tsx`, a 2-tab `AppTabs` in `src/components/app-tabs.tsx`) — no PharmaCRM screen has been
built yet. Dependencies aren't installed; run `pnpm install` from the repo root first (this
package joins the workspace via `pnpm-workspace.yaml`'s `apps/*`).

**Backend readiness — only these endpoints exist today**, everything else in the PRD has no API
yet:

| Works now | Endpoint |
|---|---|
| Login / refresh / logout, all device-approval responses (pending/rejected/limit-reached) | `POST /api/identity/auth/*` |
| MR's assigned routes (for a Daily Plan's route picker) | `GET /api/territory/my-routes` |
| Approval inbox/team/mine/detail/approve/reject/bulk | `/api/approval/*` — **built, but nothing registers with it yet** (no Daily Plan, DCR, or Leave module exists), so these will return empty lists until Phase 4 lands |

**Missing and blocking real screens:** there is no `GET /me` yet (no way to show the logged-in
user's own name/designation on the Home header), and none of Field Master Data, Planning,
Field Activity, Sales, Marketing, HR, or Payroll exist server-side. Build those screens against
mocked data for now; wire them up module by module as `docs/roadmap.md` phases land.

## Screens: the 4-tab structure this app needs

Per PRD §6.1 — Bottom nav: **Home, Docs, Reports, Team** (Team conditional: only ASM/RSM/ZSM/NSM).

- **Home** — 4 quadrants: DCR (Daily/Monthly Plan, Dr/Chemist Call & Followup, Expenses, Summary
  & Final Submission), Marketing (Orders, Visuals/Campaigns/Targets, Gifts/Services), Resources
  (document library), Utility (Holiday List, Forms, FY Toggle)
- **Docs** — Resources library (price lists, literature, training)
- **Reports** — DCR Report, TP Report, Gift & Sales Report
- **Team** (managers only) — Approvals Inbox (direct reports, actionable), Team activity
  (downline, read-only past direct reports), Request detail (approve/reject with required
  comment on reject)

The full screen-by-screen breakdown (roughly 44 screens, plus which existing designs match vs.
need rework) was worked out against this repo's docs and the Figma file
(`6UTWwR30ihiHbqDCadaDuE`) earlier in this project — ask for that list again if it's not in your
context.

## Conventions specific to this app

- **Expo Router** — routes live in `src/app/`; every file there is a screen, `_layout.tsx`
  defines a navigator. Keep components/hooks/utils outside `src/app/`. Import `Link`, `router`,
  `useLocalSearchParams` from `expo-router`, never `@react-navigation/native` directly.
- **`@/*` import alias** resolves to `src/*` (see `tsconfig.json`) — use it instead of relative
  `../../` chains.
- **Typed routes and the React Compiler are both on** (`app.json` → `experiments`) — don't fight
  either; if a route param type error looks wrong, regenerate types rather than casting past it.
- **Offline-first is not optional for DCR screens.** Per HLD 01, `DailyPlan`/`MonthlyPlan`/`DCR`
  Submit require a live connection at tap time (disabled offline, no queued fallback); an
  individual `DoctorCall`/`ChemistCall`/`Expense` queues locally and syncs later. Don't build a
  screen's Submit button as a simple network call — check HLD 01 §1.2 for which action it is.
  The local-store layer (SQLite + Drizzle, or similar) isn't chosen yet — see
  `../../docs/engineering/tech-choices.md` under "Undecided" before picking one.
- **GPS/geofence check runs on-device first**, against the locally-cached Doctor/Chemist
  location, before the call is allowed to save — see HLD 01 §2. A `FAIL` does not block
  submission; it just flags the record for the manager's review.

## Commands

```bash
pnpm start            # expo start
pnpm android           # expo start --android
pnpm ios               # expo start --ios
pnpm web                # expo start --web
pnpm lint               # expo lint
npx tsc --noEmit        # typecheck
npx expo install <pkg>  # ALWAYS use this instead of pnpm add — resolves SDK-compatible versions
npx expo-doctor         # diagnose dependency/config issues
```

Run from the repo root instead when you want it through the workspace filter:
`pnpm --filter fieldapp <script>` (package name is `fieldapp`, lowercase, per `package.json`).

Run lint and typecheck before declaring any task done.
