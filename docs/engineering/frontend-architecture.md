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
