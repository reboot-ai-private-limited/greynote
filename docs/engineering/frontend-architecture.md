# Frontend architecture (`apps/web`)

The Admin / HR / Accountant portal. Next.js 15 App Router, but **a client-side panel**: every screen is a client component and
nothing fetches on the server, because the access token lives in browser memory and the refresh token is an httpOnly cookie
the Next server never sees. Modelled on `../driverzone/apps/web`; where this differs, the decision log says why.

## Where things go

```
src/
  app/                    ROUTES ONLY — a page.tsx imports one <Xxx>Screen and renders it
    layout.tsx, providers.tsx, page.tsx, error.tsx, not-found.tsx, globals.css
    (auth)/login/         the sign-in page
    (panel)/layout.tsx    the session gate + AppShell; everything under (panel) needs a session
    (panel)/<module>/page.tsx, [id]/page.tsx
  components/
    shell/                AppShell, SideNav, TopBar, nav-items.ts, FinancialYearSwitcher
    ui/                   primitives: Button, Input, DataTable, DataState, Pagination, toast, …
  features/<module>/      one folder per backend module (territory, hr, approvals, payroll, …)
    components/           XxxScreen.tsx and its parts
    hooks/                useXxx.ts — TanStack Query wrappers
    lib/                  pure logic (draft builders, mappers) + its *.test.ts
  lib/
    api/                  client.ts, ApiError.ts, toErrorState.ts, endpoints/<module>.ts
    auth/                 session.ts (in-memory token), SessionProvider.tsx, next-path.ts, device.ts
    query/                client.ts, keys.ts, factory.ts, mutation.ts
    hooks/                useDebouncedValue, useFilterParams, timing.ts
    financial-year.ts, useFinancialYear.ts, format.ts, money.ts
  styles/                 tokens.ts + theme.css (Tailwind v4 @theme), kept in step by a drift test
```

**The rule for a new screen:** page (route) → `Screen` (feature component) → hook (`features/<m>/hooks`) → endpoint
(`lib/api/endpoints/<m>.ts`) → types from `@greynote/contracts`. A page never fetches; a component never calls `fetch`.

| Question | Answer |
|---|---|
| A button / table / input used by two modules? | `components/ui` |
| Used by one module only? | that module's `features/<m>/components` |
| A pure function (validation, mapping)? | `features/<m>/lib` with a test beside it |
| An API call? | `lib/api/endpoints/<m>.ts`, a plain object (`zonesApi.list(token, query, signal)`) |
| A request/response type? | `@greynote/contracts` — add it there, never declare it in the web |
| A constant? | the module that owns it; there is no global `constants/` or `types/` folder |
| Client state shared across screens? | probably the URL (`useFilterParams`); there is no global store |
| A feature needs another feature's data? | It may import from a feature of a **lower backend tier** (field master data reads Territory: `useTerritoryDirectory`, `usePlaceSearch`), never the other way, mirroring `apps/api`'s tiers. A list needed in full for a label or picker (a page of 100 silently drops the rest) is read with `fetchAllPages` behind a hook the owning feature exports. |

## Conventions

- Names: components `PascalCase.tsx`, screens `XxxScreen.tsx`, hooks `useThing.ts`, everything else camelCase or kebab-case.
- **Server state is TanStack Query.** Reads go through `authedQueryOptions` (adds `withAuth`, the abort `signal`,
  `keepPreviousData`); writes through `useApiMutation` (toasts the server's message + request id, invalidates the keys you
  pass). Query keys come from the `keys` factory and include the Financial Year.
- **Render the server's `message`, branch on `code`.** Never write copy keyed on a code. `toErrorState` is the one place that
  decides what each error renders (e.g. `FORBIDDEN` gets no retry button).
- Every data surface goes through `<DataState>`: loading (skeleton), error, empty, ready. Background refetches show only the
  2px `TopProgressBar`. A failed read never toasts; a write does.
- Filters, search and page live in the URL (`useFilterParams`); search is debounced via `timing.ts`.
- Money is integer paise (`lib/money.ts`); dates are shown in Asia/Kolkata (`lib/format.ts`).
- Nav is role-filtered in `nav-items.ts`, which is **cosmetic**: the API returns 403 regardless.
- Tests are Vitest in a Node environment — pure logic only, no DOM. Keep logic in React-free modules so it can be tested.

## Design system

White canvas; structure from hairline borders and a faint tint (sidebar, table headers), not grey slabs. One indigo accent
used sparingly (primary actions, active nav, key numbers); Inter (self-hosted via `@fontsource-variable/inter`); comfortable
density (40px controls, 48px table rows); numbers use `tabular-nums`. Shadows are only for things that float (menus, dialogs).

- **Tokens** live in `styles/tokens.ts` (ramps → semantic names → status `bg/fg/solid`, radius, shadow) and are mirrored in
  `styles/theme.css`. `tokens.drift.test.ts` fails if they disagree; `tokens.contrast.test.ts` fails if a text/background pair
  drops below WCAG AA (4.5:1). Components use only the **semantic** names (`bg-surface`, `text-text-muted`, `bg-success-bg`),
  never a ramp step or hex, so a retheme is a change in `tokens.ts` + `theme.css` and nothing else.
- **Status** (`Badge`): `success` = approved/paid, `warning` = pending, `danger` = rejected/blocked, `accent` = info,
  `neutral` = draft. The dot carries the colour for people who cannot rely on the tint.
- **Components** in `components/ui`: Button, Input/Textarea, FormField, Select, Dialog, Tabs, DropdownMenu, Badge, Card,
  StatTile, DataTable (sortable), Pagination, EmptyState, ErrorState, Skeleton, TopProgressBar, toast.
- **`/design`** renders every token and component in every state. Development only (404s in a production build). Add a new
  primitive there in the same change that adds it.

## Navigation rail

The sidebar is an **icon-only rail** (logo mark + icons) on `lg+`; hovering it, or tabbing into it, expands it **over** the page
with no layout shift. A fixed 4rem spacer reserves the collapsed width, and only the fixed `<nav>`'s width animates, so content
never reflows. Details worth keeping:
- Labels are faded, never hidden (`opacity`, not `display:none`), so screen readers still announce every item.
- Keyboard expansion uses `:has(:focus-visible)`, not `:focus-within`, so a mouse click on a link does not leave the rail stuck open.
- A ~100ms hover-intent delay on expand stops it flashing open when the mouse sweeps the left edge; Esc collapses it;
  `prefers-reduced-motion` turns the transition off.
- Below `lg` it is the off-canvas drawer with labels always on (touch has no hover).
- Colours are the `sidebar*` tokens (light accent tint, solid accent pill for the active item); `/design/shell` (dev only)
  renders the real rail next to sample content for checking all of the above without signing in.

## Maps (route stops)

`RouteMap` previews a route's stops with numbered pins and a **dashed straight line** captioned "not the driving route" — the
API stores no route geometry and the browser key is scoped to the Maps JavaScript API only, so a road-shaped line would imply a
path nobody verified. Rules:
- **Two different Google keys.** The API's key is server-side (Places + Routes) and never reaches a browser. The map needs its
  own browser key, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, which ships in the bundle: protect it by *configuration* — HTTP-referrer
  restriction to the portal's domain and API restriction to *Maps JavaScript API* only — and set a billing alert (each map load
  is billed). It is an optional Docker build arg.
- **No key = graceful fallback.** The map panel says it is unavailable and the stops list (with coordinates) still works.
- All map code goes through `lib/googleMaps.ts` (the loader's `setOptions` is a singleton and must run once). Legacy
  `google.maps.Marker`, which needs no Map ID.
- **Place search is a billed call per request:** debounced 500 ms, 3+ characters, cached 5 minutes, never retried
  (`retry: false` in `authedQueryOptions`), and a 503 degrades to a message.

## Routes

`/routes` (list), `/routes/new`, `/routes/[id]`. A route is edited on full pages, not dialogs: an ordered 2–25 stop list, a
distance that can fail, an optional per-km rate override and its assigned MRs. Things worth knowing:
- **A failed Google distance calculation is HTTP 200 with `distanceStatus: FAILED`.** Every response that may have recalculated
  goes through `announceRoute`, and a failed route is shown as "Failed", never as 0 km.
- `distanceKm` is the paid one-way figure used for TA and is not doubled for a return trip; the UI says so.
- Saving stops carries the loaded `revision`; a 409 with `field: 'revision'` shows a "changed elsewhere — Reload" dialog and
  discards the draft. A waypoint edit or recalculation replaces a manual distance, and the UI warns before it.
- The stop list only accepts places found by search, refuses a duplicate `placeId`, and enforces 2–25 (`lib/waypoints.ts`).
- Deactivating a route needs every MR unassigned (the server's refusal is toasted); assigning needs an active route.

## Dashboards

`/dashboard` is an **operational** dashboard — a work queue, not BI. It answers one question per role: *what needs my action
right now?* The role decides the cards (`cardsForRole` in `lib/dashboard.ts`, mirroring what the API lets each role call):

| Role | Cards |
|---|---|
| ADMIN | Pending approvals (+ the five longest waiting), devices awaiting approval, active employees (+ onboarding), MRs missing stock |
| HR | Leave awaiting you (+ list), active employees, on leave today |
| ACCOUNTANT | Expenses awaiting payment, payroll status for the month just ended |

Rules (keep them for every later screen):
- A tile answers "what do I do next?" and links to the screen that resolves it. It only links to a **built** screen
  (`isRouteBuilt`), so no tile 404s. No vanity numbers.
- One screen, at most six cards, the big number first and the label second. Colour means status only.
- **Each tile owns its query and its own loading / error / ready state** (`ActionTile`). One failing endpoint fails one tile.
- Never show a number we cannot compute correctly: the expenses list is capped at 500 (unpaid first), so at the cap the tile
  says "500+ claims" and no total instead of an undercount. Gaps with no endpoint (blocked employees, missed DCRs) are listed
  as "Coming soon", never hidden or faked.
- The numbers are the live queue: `staleTime.live`, refetch on focus. Counts come from `total` on the paginated lists
  (`pageSize=1`), or the array length for the endpoints that return a bare array (devices, expenses, payroll, missing stock).
- Rules like "500+" and "All clear" live in pure mappers (`features/dashboard/lib/tiles.ts`) and are unit-tested.
- Dates: the API uses `YYYY-MM-DD`, `YYYY-MM` and ISO datetimes; `lib/dates.ts` computes every "today" in Asia/Kolkata.
- Charts and trends wait for an endpoint that returns a time series; when they arrive, follow the `dataviz` guidance and keep
  a table as the fallback view. Pie charts are avoided.
- Below `lg` the sidebar is an off-canvas drawer opened from the top bar; tiles reflow 4 → 2 → 1 columns.

Gaps that would justify a `GET /dashboard/summary` module later: blocked-employee and missed-DCR counts, plans pending, an
unpaid-expense total beyond the 500 cap, payroll counts by status in one call, and any per-day/month series. Swapping it in
touches only `hooks/useDashboardData.ts`.

## Auth and session

`POST /identity/auth/login` (employee code + password; the web sends a stable `deviceId` from localStorage and
`platform: 'WEB'`). The access token lives in a module variable in `lib/auth/session.ts`, never in storage. The refresh token is
an httpOnly cookie (`gn_refresh`, `SameSite=Strict`, path `/api/identity/auth`); the client sends `X-Client: web` on those calls.
A reload has no token, so boot does a silent refresh (`restore()`), then `GET /identity/auth/me`. Refresh is single-flight
(rotation + reuse detection means two parallel refreshes would sign the user out) and proactive at ~12 minutes; `withAuth`
refreshes once on a 401 and replays. When the session ends the query cache is cleared. See
[`../LLD/identity.md`](../LLD/identity.md) and the 2026-10-01 decision-log entry.

## Financial Year

The switcher sets a module-level year that `lib/api/client.ts` sends as `X-Financial-Year` on every request; "Current" sends
nothing. A past year is read-only server-side (`409 FINANCIAL_YEAR_READ_ONLY`, in `ApiError.detailCode`) and the shell shows a
banner. Changing the year clears the query cache. The switcher lists the five calendar years before this one — it does not yet
read `FY_START_MONTH` from the server (the config has no HTTP surface yet).

## Build and run

`pnpm dev:web` runs API :3000 + web :3001. `NEXT_PUBLIC_API_BASE_URL` is inlined at build time (a Docker build arg). Workspace
packages are consumed as TypeScript source via `transpilePackages`; `@greynote/contracts` imports its own files with `.js`
suffixes, so `next.config.ts` aliases `.js` to `.ts`/`.tsx`. See [`build-and-deploy.md`](build-and-deploy.md).
