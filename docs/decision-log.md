# Decision Log

Decisions that have been **made**, newest first, with what they replaced and what they cost.

Three files cover decisions and they do not overlap:

| File | Answers |
|---|---|
| [`erd/`](erd/README.md) / [`hld/`](hld/README.md) | **The design as written** — schema and mechanism, in the present tense |
| [`engineering/tech-choices.md`](engineering/tech-choices.md) | **Current state**: what we use and why |
| this file | **History**: when it changed, what it replaced, what was rejected |

When something here supersedes an ERD/HLD doc or `tech-choices.md`, that doc gets rewritten to
describe the new present and this log keeps the record of the change. This log is append-only —
entries are never edited to match a later reversal; a reversal is a new entry that references the
old one.

---

## 2026-10-03 — Payroll rows carry the employee's name and code

**Decision:** every payroll row the HTTP API returns (get, list, finalize, and each line of a generate result) now has `userName` and
`employeeCode`, resolved in one batched Identity call per response. The stored `PayrollRun` and the public contract are unchanged.

**Why:** found while planning the Accountant screens. A run holds only a `userId`, so a sheet of a few hundred employees would have
needed a few hundred lookups to show a name. The expense audit already returns the name and code on each row.

**Cost:** one extra Identity read per payroll response; the contract still returns the stored run.

---

## 2026-10-03 — A plan change and a doctor service can be read by their own id

**Decision:** two read endpoints, `GET /planning/changes/:id` and `GET /field-activity/doctor-services/:id`, with the same readers as
their siblings (the owner, their managers and Admin for a change; Admin or the tied MR for a service; anyone else a `404`).

**Why:** found while planning the approval previews. An approval request points at the record it is about by its own id, but a plan
change could only be read through its plan's id and a doctor service only through a filtered list. The portal could not show
Admin what a request was asking for.

**Cost:** two more GET routes, classified in the Financial Year route guard as by-id. No change to existing callers.

---

## 2026-10-03 — Admin and HR can list decided approval requests: `GET /approvals/all`

**Decision:** a new `GET /approvals/all` (HR, Admin) returns requests in any status, newest first, with the inbox's filters and row shape.
Admin sees every request; HR sees the kinds it is a final approver of (Leave). It is scoped to the selected Financial Year, like the other lists.

**Why:** found while planning the Approvals screen. The inbox is open requests only, `/team` is for field managers and `/mine` is the caller's
own, so Admin and HR had no way to see a decided request, and `reopen` (Admin, Approved only) was unreachable without already knowing an id.

**Cost:** none to existing callers; one more route, classified in the Financial Year route guard.

---

## 2026-10-03 — Employee documents must really be a PDF, JPG or PNG

**Decision:** `POST /identity/users/:id/documents` refuses any file whose own leading bytes are not a PDF, JPEG or PNG, with a
`400` before anything is stored. The check ignores the file name and the declared `Content-Type`. A file Cloudinary cannot read
(a corrupt PDF) is also a `400`, not a server error. The web form already offered only those three types.

**Why:** the endpoint accepted anything up to 10 MB and stored it publicly through Cloudinary's `resource_type: auto`. Marketing
already refuses executables and corrupt files; employee documents held personal data and had no check at all.

**Cost:** a PDF with more than 1 KB of junk before its header is refused, as most readers would refuse it too. A Word file or
a GIF is not accepted; the client's document types are scans and photos.

---

## 2026-10-03 — A deactivated account can't sign in, and deactivating signs the employee out

**Decision:** an account with `status: inactive` is refused at login (`403`, after the password check so existence is not
revealed, and before the device registry so no phone request is created) and at refresh (`401`, ending the user's sessions).
Setting `status: inactive` through `PATCH /identity/users/:id` revokes every session of that employee at that moment, once, on
the transition only.

**Why:** found while building the Security tab. "Deactivate" only changed a field: nothing read it at login, so an offboarded
employee could keep signing in and submitting. `status` is sticky by design and no endpoint reactivates, so this is
effectively offboarding; it has to cut access.

**Cost:** an access token already issued stays valid until it expires, up to 15 minutes, because the auth middleware verifies the
token and does not read the database. Reactivation does not exist; it would be a deliberate new endpoint.

---

## 2026-10-03 — A manager can't create a reporting loop; optional profile fields can be cleared

**Decision:** (1) `PATCH /identity/users/:id` refuses a `managerId` that is the employee or that already reports to them,
directly or through the chain. (2) `guardianName`, `qualification` and `dateOfJoining` accept `null` to clear them; a missing key
still means "leave alone". Required onboarding fields stay changeable but not clearable. (3) `dateOfBirth` is now parsed from a
string, because `z.coerce.date()` turned `null` into 1 January 1970 instead of refusing it.

**Why:** the first two were found while building the Employee detail screen. With only an existence check, two employees could be
set to manage each other and the approval chain would never reach the top; and a wrongly entered guardian could never be removed.
Clearing a required field would silently turn an active employee back into `pending`, so that stays a deliberate refusal.

**Cost:** the loop check is one read per level above the new manager (about five). It does not repair loops that were already in
the data; those are tolerated as before.

---

## 2026-10-03 — HR manages Designations and Pay Bands; the Accountant can read Pay Bands

**Decision:** `GET/POST/PATCH /designations` and `/pay-bands` are open to **Admin and HR** (were Admin only). `GET /pay-bands`
is also open to the **Accountant**, read only. `/roles` stays Admin only; it is a fixed set of four names.

**Why:** PRD §5.3 gives HR the Employee Lifecycle (assign Designation and Pay Band) and the Accountant view-only access to pay
grades. With Admin-only reads, HR could not fill the pickers needed to complete a FIELD employee's profile. The client confirmed
HR also maintains these records.

**Cost:** HR can change the rates behind future TA/DA and payroll runs. A finalized PayrollRun is unaffected, because it
snapshots `base_salary` at generation (Phase 7).

---

## 2026-10-01 — Routes screens: full pages, map preview with its own browser key

**Decision:** Territory Routes get a list page, a create page and a detail page (details, stops & distance, assigned MRs)
rather than dialogs. The stops editor shows a **map preview** (numbered pins, dashed straight line captioned as not the driving
route), which needs a separate browser-side Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, optional, referrer- and
API-restricted); without it the map shows a fallback and everything else works. Place search is debounced, 3+ characters,
cached and never retried.

**Why:** a route has an ordered list of up to 25 stops, a distance state, a rate override and assignments — too much for a
dialog. The map makes order and geography checkable at a glance. Keeping the API's server key and the browser key separate means
the key that can call billed Places/Routes APIs never ships to a browser.

**Rejected:** no map (list-only was the cheaper default, but you chose the preview); drawing a road-shaped line (the API has no
geometry and the browser key is not scoped to Directions); free-text stops (only a searched place has a `placeId` and a verified
location); dialogs like Zones/HQs/Areas.

**Cost:** one more key to create, restrict and watch for billing; each map load and each place search is a billed Google call;
the straight line can be mistaken for the route despite its caption.

---

## 2026-10-01 — Territory tree deferred until after the MVP; back to dedicated Zones / HQs / Areas pages

**Decision:** The single `/territory` tree page (entry below) is reverted. Zones, HQs and Areas are separate pages again
(`/zones`, `/hqs`, `/areas`, each its own nav item). The icon-only navigation rail from the same change is kept. A tree view of
the hierarchy is a post-MVP idea, to be designed properly then.

**Why:** the tree page offered one primary action ("New zone") and pushed every other action into row menus, which made the
page feel thin and the common tasks harder to find than on a dedicated list with its own New button, filters and columns.
Redesigning the page properly is not MVP-critical, and the dedicated pages already cover every Territory task.

**Cost:** three nav items under Master data instead of one, and no at-a-glance hierarchy view. The reverted work (an accessible
tree primitive, lazy per-branch loading, flat cross-level search) is in git history at `d9b69e3` if a tree is wanted later.

---

## 2026-10-01 — Icon-only navigation rail and one Territory tree page

**Decision:** (1) The sidebar is a light, accent-tinted icon rail that expands over the content on hover or keyboard focus,
without changing the page layout; below `lg` it stays a drawer. (2) Zones, HQs and Areas are one page at `/territory`, a tree
whose branches load lazily when opened; the old `/zones`, `/hqs`, `/areas` URLs redirect there. A search shows a flat results
list across all three levels.

**Why:** the rail gives every table about 200px more width without making navigation harder to reach, and expanding as an
overlay means nothing jumps. The tree matches how the data is shaped, removes the "which page do I add an area on?" hop, and
lazy loading is the only approach that is correct against an API that caps lists at 100 — fetching everything up front would
silently truncate in a large org.

**Rejected:** a pin-to-expand button (more state for little gain); a dark sidebar; loading the whole hierarchy in the browser
(truncates past 100 per list); keeping three list pages (three trips for one task).

**Cost:** an icon-only rail relies on recognisable icons (labels appear on hover/focus, and a touch device uses the drawer); a
branch with more than 100 children shows a "use search" note rather than paging; tree search cannot expand in place.

---

## 2026-10-01 — Dashboards: role-based work queues composed from existing endpoints

**Decision:** The dashboard is an operational, role-specific work queue (Admin / HR / Accountant), built by composing the list
endpoints that already exist; each tile owns its query and failure state, links only to built screens, and refuses to show a
number it cannot compute correctly (capped lists show "500+"). Charts, `GET /dashboard/summary`, draggable widgets and dark
mode are deferred. The sidebar becomes a drawer below `lg`.

**Why:** the API has no aggregate or time-series endpoint, and a new cross-module backend module would have blocked the screen
for no immediate gain. Counts are available from `total` on the paginated lists and from array lengths elsewhere. A dashboard of
fabricated or undercounted numbers is worse than one that says "coming soon".

**Rejected:** a `/dashboard/summary` module first (delays the screen; it crosses several modules' `.public` contracts); one
shared query for the whole page (one failure would blank every tile); BI-style analytical/strategic dashboards (no trend data).

**Cost:** several requests per load (tiles refetch on focus), the expenses tile can only be exact under 500 unpaid claims, and
blocked-employee / missed-DCR tiles are placeholders until endpoints exist. Noted for later: `GET /identity/users?isBlocked=false`
is parsed as `true` (`z.coerce.boolean()`), so only `isBlocked=true` may be sent until the schema is fixed.

---

## 2026-10-01 — Web design system: white canvas, indigo accent, Inter, comfortable density

**Decision:** The portal's look is a white canvas with hairline borders (no grey page background), one indigo accent
(`accent-600`), Inter via `@fontsource-variable/inter`, and comfortable density (40px controls, 48px rows). Tokens are ramps →
semantic names → status triples (`bg/fg/solid`) in `apps/web/src/styles/tokens.ts`, mirrored in `theme.css`; a drift test and
a WCAG-AA contrast test guard them. Dark mode is deferred. A dev-only `/design` page is the living style guide.

**Why:** the first scaffold's grey-page-white-card look was a placeholder, and a retheme costs more with every screen built on
it. Semantic-only component classes make a later palette or dark-mode change a tokens edit. The contrast test already caught
one failing pair (`text-subtle` on the tinted surface, 4.42:1) before any screen used it.

**Rejected:** teal accent (collides with the "approved" green); compact density (HR and Accountant live in tables all day);
Google-hosted font via `next/font` (needs network at build time); a `packages/design-system` (see the entry below).

**Cost:** the accent hex is a placeholder until there is a brand colour; swapping it is one ramp in `tokens.ts` and `theme.css`.

---

## 2026-10-01 — Web portal setup: cookie-mode refresh, no design-system package yet, web on :3001

**Decision:** (1) The refresh token reaches a client by one of two routes, chosen by a request header. `X-Client: mobile`
gets it in the JSON body, as before. Anything else (the browser) gets it as an `httpOnly; SameSite=Strict` cookie scoped to
`/api/identity/auth` and it is left out of the body. `/refresh` and `/logout` read the token from the body, or from the cookie
when the caller sent an `X-Client` header. (2) New `GET /api/identity/auth/me` returns the signed-in `UserSummary`, so the web
needs no JWT decoding at boot. (3) `apps/web` is Next.js 15 (App Router, client-side panel), TanStack Query, Tailwind v4,
modelled on `../driverzone/apps/web`. (4) No `packages/design-system`: primitives live in `apps/web/src/components/ui`, tokens in
`apps/web/src/styles/tokens.ts` + `theme.css`. (5) Web runs on **:3001**; the API keeps :3000; `CORS_ORIGINS` defaults to
`http://localhost:3001`. (6) React is pinned to 19.2.3 workspace-wide via `pnpm-workspace.yaml` `overrides`, matching Expo.

**Why:** the API only returned tokens in the body, so a browser would have had to keep a 30-day rotating refresh token in JS,
readable by any XSS. A cookie keeps it out of reach; the header lets the phone keep its body contract with no change. The
header is a response-shape switch, not a security boundary: a caller that lies only changes where its own token is delivered.
React DOM / Radix / Tailwind components cannot be shared with React Native, so a UI package would have one consumer; only the
tokens could be shared, and they are kept in one file so they can be lifted out in Phase 10.

**Rejected:** tokens held in browser memory (refresh token exposed to XSS); a Next BFF proxying auth (a second hop and a second
place for session logic, for no gain once the API can set the cookie); moving the API to :4000 (touches env, Dockerfile,
healthcheck, docs).

**Cost:** the web and the API must share a registrable domain in production (SameSite=Strict), and `CORS_ORIGINS` must list the
portal's origin. Cookie reads on refresh/logout require a custom header, which forces a CORS preflight, as a CSRF guard on top
of SameSite. Reversing the cookie default later would be a breaking change for any browser client.

---

## 2026-09-30 — Financial Year toggle: a per-request header, read-only, out-of-range is an error

**Decision:** (1) The selected past financial year travels as a header, `X-Financial-Year: <start year>`, on each request —
stateless, nothing stored; absent or current = normal. (2) Any non-read request carrying a past-year header is `409
FINANCIAL_YEAR_READ_ONLY`, except login, refresh and logout. (3) On the scoped lists, dates left out default to the year's
range and dates outside it are `400 OUTSIDE_FINANCIAL_YEAR`. (4) Scope: DCRs, expenses, plans, leaves, orders, payroll runs,
the approval lists and leave balances; not products/chemists/campaigns/holidays/targets/monthly stock; by-id reads are not
re-checked. (5) Payroll's list gains a `fromMonth`/`toMonth` range so a year can be listed; leave balances are no longer
created when a past year is viewed. (6) A test lists every GET route and fails if one is not classified.

**Why:** a header needs no server-side state or new endpoint, works the same for the phone and the web, and the
"read-only" rule is one check in one place instead of one per endpoint. Rejecting out-of-range dates makes a UI mistake
loud instead of showing a quietly wrong list. Viewing history must not write, and the leave-balance screen did.

**Rejected:** a stored per-user setting (state to keep in step across devices); trimming out-of-range dates silently;
checking every by-id read (the id only comes from a scoped list); leaving `POST /sync/push` open under the header (the
phone does not send it there).

**Cost:** each new dated list needs a scope line, which the guard test enforces. HLD 09's argument for read-only — a stale
approval would change a finalized payroll — is weaker now that payroll counts by paid month; the rule stays for
simplicity and the PRD's "view", and a stuck past-year item still has no path (sign-off J3).

---

## 2026-09-30 — Payroll: the month is the month an expense was paid; who runs it; ended months only

**Decision:** (1) Field Activity's `getPaidTaDaTotal(userId, month)` counts what was `PAID` **during** the month (by
`paid_at` in the business timezone), replacing "for report days in the month". (2) Accountant and Admin generate and
finalize payroll; HR never. (3) Only months that have ended can be generated. (4) A mid-month joiner is paid the full
base salary and the run carries `joined_in_month`; no proration until the client gives a rule. (5) The deduction is
`round_half_up(unpaid_days × base / 30)` with unpaid days capped at 30, and the run keeps `unpaid_leave_days` as a
snapshot. (6) PF/ESIC/Medical and salary overrides (F6, F7) stay out of the formula.

**Why:** with report-day months, an expense reported on 28 September and paid on 3 October — after September was
finalized — would reach no payroll ever; nothing can reopen a finalized run and Field Activity cannot see Payroll's
lock (it sits above it). Counting by paid date needs no lock at all, and matches how the Accountant works: pay, then
generate. Refusing the unfinished month stops a finalized sheet that misses the rest of the month.

**Rejected:** keeping report-day months and refusing late payments (needs a cross-tier lock hook); accepting the gap
(money silently missed); proration by joining date (the rule is the client's to give).

**Cost:** payments are counted in the month they were made, so an employee's September travel paid in October shows
in October's sheet; the two-fields-more `PayrollRun` differs slightly from the first ERD.

---

## 2026-09-30 — Marketing: one Target per key, what "achieved" counts, Visuals uploaded through the API

**Decision:** (1) A Target is unique per user + month + product + campaign; setting it again replaces it. (2)
"Achieved" is worked out live from Sales: orders by the user and their downline dated in the month, `PLACED` and
`DONE`, never `CANCELLED`; a product narrows to its lines; a campaign narrows to its dates inside the month; no filter
means the general target against all sales. Sales' contract gains `sumOrderAmount`. (3) Only Admin or a manager sets
Targets, for themselves and their downline. (4) Admin uploads a Visual to the API (multipart, ≤ 25 MB, image / PDF /
MP4-MOV-WebM), which stores it in Cloudinary; Cloudinary configuration moves to `shared/storage/cloudinary.ts`,
shared with Identity. Campaigns are company-wide, status-only edits.

**Why:** the ERD left uniqueness open, and a duplicate row would silently inflate a manager's rollup. Counting
cancelled orders would reward cancelling; counting only `DONE` would lag behind MRs who never mark them. Uploading
through the API keeps the storage account and the rules in one place, at the cost of buffering up to 25 MB per request.

**Rejected:** several Targets per key summed (double-count risk); an Admin-supplied file URL (the client asked for
upload); "any" as the meaning of an omitted filter (it would add a general and a product target together).

**Cost:** an MR without a team cannot set their own Target; unit prices and achieved both rest on MR-entered orders
(sign-off E7). Live run found and fixed a Campaign saved with no description (Mongoose reads `''` as missing) and a
corrupt PDF answered `500` instead of `400`.

---

## 2026-09-30 — Orders: lines embedded, server-side amounts, one winner on complete/cancel

**Decision:** (1) An Order and its lines are one document; the schema refuses a total that is not the sum of the
lines, an order with no lines, and both/neither outlet. (2) The server works out every line amount and the total from
quantity × unit price (whole paise, capped at `MAX_PAISE`); an amount sent by the phone is ignored. The MR enters the
unit price — Products have no price. (3) Only an MR places an Order; the order date defaults to today and may be past,
not future. (4) `PLACED → DONE/CANCELLED` is one conditional update: of racing calls one wins, the rest are `409`; the
MR who placed it or an Admin may do it, a manager may only read. (5) `ORDER` is a sync kind; completing and cancelling
are online. (6) Orders are not gated by the DCR compliance block.

**Why:** the ERD's separate `OrderItem` table would need a multi-document transaction for what is one fact; Mongo
does not enforce a denormalised total, so the schema does. Trusting a phone's arithmetic silently corrupts totals
Marketing will read.

**Rejected:** a price list now (no client rule for it yet — E-series question to add); Admin placing orders on an
MR's behalf (no owner to attribute it to); offline complete/cancel (the LLD keeps them as HTTP).

**Cost:** unit prices are free text from the MR until the client gives a price list.

---

## 2026-09-30 — Monthly stock: due on the month's last day, for Chemists and Distributors

**Decision:** (1) At month end an MR records **opening and closing stock per Product** for each of their
Chemists and Distributors; Admin may enter for any. It is due by the **last calendar day of that month**
(28/29/30/31), not the 5th of the next. `MONTHLY_STOCK_SUBMISSION_DAY` is replaced by
`MONTHLY_STOCK_GRACE_DAYS` (default `0`): extra days after month end, so "the 5th" becomes a config change. (2)
After the deadline an entry is refused (`409`) unless Admin has unlocked that month; a future month is refused. (3)
Missing counts are **reported** to the manager and Admin (`GET /sales/monthly-stock/missing` and a `sales:stock-check`
job), not enforced by a DCR block; notification delivery waits for F8. (4) An MR may enter only for outlets on their
Routes (`canActOnChemist` is added beside `canActOnDistributor`); managers read their team's counts. (5) Stock rides
the daily push as a `MONTHLY_STOCK` record kind; the deadline is checked when the push arrives.

**Why:** the client described the month-end visit and the last-day rule; the LLD's 5th-of-next-month came from the
questionnaire's proposal (§15.4) and was never confirmed. A count taken on the last day would otherwise sit a day
past the deadline. A block would punish the MR for a chemist who was closed; a visible list lets the manager act.

**Rejected:** keeping the 5th (contradicts the client); accept-and-flag (no teeth); blocking the DCR (harsher than
the client's rules ask).

**Cost:** E1 is still a working assumption. The offline caveat: an MR who taps Submit after midnight on the last day
is refused, so the field app should push before the day ends.

---

## 2026-09-29 — The missed-DCR job's rules, and reimbursements in Payroll's total

**Decision:** (1) `DCR_MISS_GRACE_DAYS` is the number of **consecutive missed working days tolerated**: an
employee is blocked once they have missed *more* than that many in a row, ending yesterday. `0` blocks on the
first miss; the default `1` blocks on the second. A day off (weekly off or holiday) and a day covered by an
approved Leave are skipped — they neither count nor break the run; days before the joining date, and before the
day an Admin last cleared a block, are nobody's to report. (2) The job has `--dry-run` and `--user`. (3)
`getPaidTaDaTotal` returns `reimbursementPaise` — the `PAID` manual expenses — beside TA and DA.

**Why:** hld/10's diagram checks only yesterday but its text says "exceeded that count", and a day-by-day block
would fire every Sunday and every holiday; the run-of-working-days reading is the one that is fair and matches
the ERD's wording. Without the clean-slate rule an unblocked employee would be blocked again the next morning
for the same old days. The user asked for reimbursements to reach net pay.

**Consequences:** HR's contract gained `listOffDates`; Identity's gained `listActiveFieldUserIds` and
`getLastBlockClearedAt`. Recorded as sign-off H5/H6 (working assumption until the client answers).

---

## 2026-09-29 — Field Activity's write path, override, TA/DA timing and compliance job

**Decision:** Phase 6 builds Field Activity on these choices (sign-off group H):

- **Records arrive through the sync push, not a POST each.** Calls, follow-ups, expenses, Doctor
  Services, Gifts marked done and the DCR's own submit are sync record kinds; the DCR submit depends on
  every other record of the day. REST stays for reads, the manager's review, Admin's gift and service
  creation, and the Accountant's mark-paid.
- **`FAIL → OVERRIDE` is a manager action on the call**, with a required comment, recorded with who and
  when, separate from approving the DCR, allowed only on a `FAIL` / `UNVERIFIED` call.
- **TA/DA is generated once, at the manager's approval;** if Admin later rejects at the final stage the
  unpaid auto rows are `CANCELLED` and any paid ones are left and reported.
- **The missed-DCR job is a script the operator runs daily by cron**, idempotent through Identity's new
  `blockUser` — no scheduler is added to the application.
- Open client rows (F2 expense limits and receipts, C8 service types, D2 Night Stay, D6 holiday TA/DA,
  B7 attendance) are built around with working assumptions, not guessed at.

**Replaces:** the field-activity LLD's per-record `POST /dcr/:id/...` endpoints and its open note on the
override's shape.

**Why:** the write path follows from the sync design already accepted (one submit, per-record results,
idempotent on the client id) — a second, REST way to create the same records would have to be kept
consistent with it for no gain. The override is per-call so a manager's judgement on one flagged visit
doesn't force a verdict on the day. Generating TA/DA at the manager stage matches HLD 06; cancelling only
*unpaid* rows keeps a payment that has happened out of automatic reversal. A script matches how the
project already runs one-off and periodic operations, and needs no new infrastructure to be reliable.

**Costs:** the phone can't create a call online without a Submit — acceptable, since Submit is the only
commit; Admin's cancellation of unpaid TA/DA needs an audit trail on the expense (`CANCELLED`, with the
reason on the approval history); a missed run of the script means blocks apply a day late, which the
grace already tolerates. Identity gained `blockUser` and a database rule of one open block per user.

**Refs:** [`LLD/field-activity.md`](LLD/field-activity.md), [`client-sign-off.md`](client-sign-off.md) H1–H5,
[`hld/10-submission-gating-and-compliance-block.md`](hld/10-submission-gating-and-compliance-block.md)

---

## 2026-09-29 — Marketing moves up to Tier 5; B9, G1 and G9 confirmed

**Decision:** `marketing` moves from Tier 4 to **Tier 5, beside `payroll`**, so it can read Sales &
Orders' order totals for the Target rollup (`hld/08`) through Sales' public contract. Tier 4 is now
`field-activity` and `sales`; Tier 5 is `marketing` and `payroll`. Also confirmed by the product owner:
the in-day Plan change rules (sign-off B9), and the one-submit sync model with its private draft
backup (G1 as amended by G9) — the client-facing rows are now Accepted, not Designed.

**Why:** the Target rollup needs "achieved" from `OrderItem`, and a same-tier import is forbidden.
Sales depends on nothing in Marketing (an Order carries no Campaign or Target), and Payroll depends
on nothing in Marketing, so lifting Marketing one tier changes one line of `MODULE_TIERS` and no
code. The alternatives — a read model Sales publishes, or a reporting layer above both — would add
machinery to avoid moving one module.

**Costs:** none in code (Marketing isn't built yet). If Sales ever needs something from Marketing
(say an Order tied to a Campaign) the dependency would point the wrong way and the tiers would have
to be revisited; nothing in the ERD asks for that.

**Refs:** [`LLD/marketing.md`](LLD/marketing.md), [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/boundaries-and-enforcement.md`](engineering/boundaries-and-enforcement.md)

---

## 2026-09-29 — The sync push applies records one at a time; the app sends chunks of 100

**Decision:** `POST /sync/push` applies its records sequentially, each in its own transaction with its
receipt, and `SYNC_MAX_BATCH` is 100 (it was drafted as 500). The app sends a larger day in chunks,
parents first and the DCR's own submit last; a dependency on an earlier chunk's record is satisfied by
its receipt. The JSON body limit became 2 MB, and the shared error handler now answers a body over the
limit with a 413 (`PAYLOAD_TOO_LARGE`) and malformed JSON with a 400, instead of a 500.

**Why:** the live run measured about 0.19 s per record against the remote dev cluster, so 500 records
held one request open for 97 s — past any ordinary proxy or phone timeout. Sequential is deliberate: two
calls drawing on one sample allocation must be decided in the order the MR made them, and running
siblings concurrently would make "which one gets the last sample" a coin flip. Chunks of 100 keep a
request near 19 s here and far shorter beside the database.

**Costs:** a day over 100 records is several requests, so the app has to chunk (a small, mechanical rule
in `LLD/sync.md`). Concurrency across genuinely independent records is the escape hatch if a day is ever
too slow — it wasn't built because it changes ordering guarantees. The 413/400 fix also corrects an
older gap: any body-parser error used to be a generic 500.

**Refs:** [`LLD/sync.md`](LLD/sync.md) *Push*, `shared/http/error-handler.ts`

---

## 2026-09-29 — Money migrated to integer paise

**Decision:** `PayBand`'s five money fields and `Route.taPerKmRateOverride` — the only money in the
system so far — moved from `Decimal128` rupees to plain integers in paise, under new names
(`baseSalaryPaise`, `taPerKmRatePaise`, `hqDaPaise`, `exStationDaPaise`, `outStationDaPaise`,
`taPerKmRateOverridePaise`), in storage, domain and API. `shared/money/paise.ts` holds the helpers,
including `multiplyPaise`, which rounds a rate × distance half up to a whole paise once, with exact
integer arithmetic. The request schema and the Mongoose schema both refuse anything that isn't a
whole, non-negative number of paise, so a decimal is a 400, never a silent rounding. Distances stay
`Decimal128` — they aren't money.

**Replaces:** the provisional `Decimal128` choice of 2026-09-23, which the 2026-09-29 entry on
G8 ratified away.

**Why:** paying people from floating-point-adjacent arithmetic is how a payroll drifts by a rupee and
nobody can say why; integers make every sum exact and the one fractional step (TA) explicit, in one
tested place. Doing it now costs one Pay Band and no Routes on the dev database; doing it after
Expenses, Orders and Payroll exist would cost every one of their tables.

**Consequences:** the API's money fields changed name and type, so any client built on the old shape
(there is none yet) would break. A deployed database must be converted before the new version starts
— `scripts/migrate-money-to-paise.ts`, dry run by default, idempotent, backing up before it writes
(`manual_deploy.md`, step 9). Run on the dev database: G1 went from ₹20,000 / ₹5 per km / ₹100 / ₹200 /
₹500 to 2,000,000 / 500 / 10,000 / 20,000 / 50,000 paise, verified, and a second run found nothing
to do. Payroll's flat `base_salary / 30` deduction is also a fractional step, so it rounds half up to
a paise once at generation.

---

## 2026-09-29 — A private draft backup under the daily-report sync (amends G1)

**Decision:** The 2026-09-29 entry above has offline data leave the phone only at the daily report's
Submit. That stands for everything that *counts*, but the phone now also **backs its unsent records up
to the server whenever it has a connection** (sign-off G9), and **Submit ends with the phone taking
the server's version of each record** (G10):

- Drafts go to a holding area as opaque blobs: upserted by `clientId`, last write wins on
  `clientUpdatedAt`, removals remembered. No business rule runs on them, and no other module, report,
  count, balance, gate or compliance check can see them — only the MR, to restore the day on a new
  phone. Submit remains the only commit and runs the real handlers.
- At Submit the server returns its own version of every record (ids, the recomputed geofence status,
  per-record failures), the phone replaces its local copies and refreshes reference data, and the
  day's drafts are deleted with the receipts.

**Replaces:** the "nothing leaves the device until Submit" line of the entry above, and the "save to
server now" button that was listed as deferred.

**Why:** the only real cost of syncing at Submit was that a lost or broken phone loses the day. An
automatic backup removes that without breaking the PRD's rule that nothing counts until Submit, and
without ever making draft data look like real data — which is why it stores blobs and validates
nothing. Reconciling at Submit means the phone never keeps a version that disagrees with the server.

**Costs:** one more collection and two endpoints; drafts hold GPS points and business data, so they
are private to the owner and purged after `SYNC_DRAFT_TTL_DAYS`. If both of an MR's phones edit one
record, the later edit wins. Anything created after the last upload is still lost with the phone.
**The client should confirm G1 as amended** — it said data syncs "only on Submit", and a hidden backup
is a reading of that, not a quote of it.

**Refs:** [`LLD/sync.md`](LLD/sync.md) *Draft backup*, [`client-sign-off.md`](client-sign-off.md) G1, G9, G10

---

## 2026-09-29 — Offline data syncs once, at the daily report's Submit; money is integer paise

**Decision:**

- **One push per day, at Submit (sign-off G1).** The field app sends everything created offline —
  Doctors added, calls with their samples, follow-ups, expenses, orders, gifts done, service
  requests, monthly stock — together, when the MR taps the daily report's Submit with a live
  connection. No background sync. Plans, Leave, approvals and login need a connection at the moment
  of the action. The DCR's own submit is the *last record* of the push and depends on all the others,
  so a day with any failed record isn't submitted; the MR fixes it and taps Submit again, and the
  records already synced are recognised.
- **Pull is a versioned snapshot per source, not a row delta (G2)**, because a delta can't see a
  Doctor appear or vanish when an MR's Routes change.
- **Lateness is judged on the phone's creation time (G3)**, within 10 minutes of the future and 7
  days of the past, both config.
- **Geofence:** radius in SystemConfig (G4); a new `UNVERIFIED` outcome for a Doctor or Chemist with
  no registered location (G5) and for a GPS reading worse than 100 m accuracy (G6); no spoof
  detection (G7).
- **Money is a whole number of paise, everywhere (G8).** No `Decimal128`, no floats.

**Replaces:** HLD 01's "queued records sync whenever connectivity returns"; the provisional
`Decimal128` money choice of 2026-09-23, which this ratifies away rather than confirms.

**Why:** PRD §2 says data syncs "only when the user explicitly hits Submit with an active
connection", and one submit makes the design simpler — no queue state, no retry policy, no
half-synced day. Integer paise makes every sum exact and every amount a value nobody can misread.

**Costs:** nothing leaves the phone until Submit, so a lost or broken phone loses the day (accepted);
a bad connection at 6 pm means retrying the whole submit, which is safe because it's idempotent.
Money needs a migration of `PayBand` and `Route.taPerKmRateOverride` before Phase 6 (roadmap);
TA is a fractional multiplication, so it is rounded half up to a paise once, when created.

**Refs:** [`LLD/sync.md`](LLD/sync.md), [`hld/01-sync-and-geofencing.md`](hld/01-sync-and-geofencing.md),
[`engineering/coding-standards.md`](engineering/coding-standards.md) *Money*, sign-off G1–G8

---

## 2026-09-29 — In-day changes to an approved Daily Plan are their own manager-approved request

**Decision:** Client §2.6 lets the day's plan change during the day with the manager's approval, but
only Admin can reopen an approved request. So a change is **its own record and approval kind**,
`DAILY_PLAN_CHANGE`, and the plan itself is never reopened:

- The employee asks for **today's** plan, while it is `MANAGER_APPROVED` or `APPROVED`, with a
  required reason. The plan stays approved, and its gate open, until the manager decides.
- The manager's approval **is** the decision — the approval module gained `managerOnly` on a kind
  definition, so the kind never has a final stage, whatever `APPROVAL_MANAGER_ONLY_KINDS` says.
- Approving writes the proposed day into the plan in the same transaction, and is refused if the
  plan was reopened, changed since the request, or the day is over.
- One waiting change per plan (partial unique index); at most `DAILY_PLAN_CHANGE_MAX` (3) applied.
- A decided change can't be reopened; Admin reopens the plan instead.

**Replaces:** the LLD's open note that left this "for Phase 4, likely a `DAILY_PLAN_CHANGE` kind".

**Why:** reopening the plan would drop the day's gate and need Admin for what the client wants the
manager to decide; a separate record leaves the approved plan usable and gives the approver a
before/after to look at. `managerOnly` is fixed on the kind, not left to Admin's setting, because
"the manager decides" is this feature's design, not a tuning knob.

**Costs:** the rules (who approves, which days, the cap of 3) are **my assumptions**, recorded as
sign-off B9 with status *Designed*, not answers from the client. A change made on a plan with field
activity already logged is Field Activity's problem to reconcile in Phase 6.

**Refs:** [`LLD/planning.md`](LLD/planning.md) *In-day changes*, [`LLD/approval.md`](LLD/approval.md),
[`client-sign-off.md`](client-sign-off.md) B9

---

## 2026-09-29 — Distributors and sample allocations: two choices

**Decision:**

- **One sample-allocation row per (Doctor, Product); issuing again adds to it.** Not one row per
  issue. The contract's `getSampleAllocation(doctorId, productId)` and the never-negative
  decrement both want a single row to read and to guard. Admin can correct the total, but not
  below what has been given out.
- **A Distributor's primary and secondary sales flags have no default.** Admin states both when
  adding one. Whether a Distributor may take primary or secondary orders is the client's rule, and
  Sales & Orders (Phase 6) will read the flags; a silent default would be a silent assumption.

**Why:** the first keeps the atomic decrement a one-document conditional update (checked live: 30
concurrent gives against 12 in stock, exactly 12 succeeded); the second follows roadmap rule 6 —
don't build on an unstated business rule.

**Consequences:** the per-issue history isn't kept, only the running totals and the last issuer.
If the client wants an audit trail of each issue, it becomes a separate ledger collection beside
the row. Territory's public contract gained `listRouteIdsInScope` so Distributors can be filtered by
Zone, HQ or Area without storing them.

---

## 2026-09-29 — A unique-key conflict inside a transaction is thrown, not returned

**Decision:** Field Master Data's repositories throw `DuplicateRecordError` when a write inside a
transaction hits a unique index (a repeated `clientRequestId`, a second active assignment for a
Doctor); the use case catches it outside the transaction and answers — the earlier Doctor for a
retry, a 409 for a racing assignment.

**Replaces:** the first version of step 4, whose adapter caught the duplicate and returned `null`
from inside the transaction, as Territory's HQ assignment does.

**Why:** the database aborts the whole transaction on any write error. Returning normally after
one meant the commit failed with "transaction aborted", so five racing retries of one create left
one Doctor (correct) but answered 500 to the other four. Found by the step 4 live run.

**Consequences:** rule added to `engineering/coding-standards.md`. Territory's
`MongoUserHqAssignmentAdapter.create` catches the duplicate the same way, so this entry first
suspected the same 500 there. A probe on 2026-09-29 (five simultaneous HQ assignments for one
employee, two different HQs) did **not** reproduce it: all five answered 200 and exactly one
active row remained. It is left as it is; the pattern is still fragile in principle, so it gets
fixed the day someone touches that adapter or a real 500 shows up.

---

## 2026-09-29 — Field Master Data built on today's assumptions (C3, C4, C6, C7, C8)

**Decision:** Phase 4's Field Master Data starts on these accepted assumptions:

- **C3 — a Route change hides an MR's old Doctors, behind a switch.** Visibility follows the MR's
  current Routes: `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` (default `true`). When on, an MR who loses a
  Route stops seeing its Doctors; their assignments are hidden when read, not rewritten, so
  giving the Route back restores them. Admin assigns Doctors on the new Route by hand, and a
  Doctor can only be assigned to an MR who has the Doctor's Route. When off, an MR keeps their
  Doctors across a Route change. Managers see the Routes and Doctors of their downline.
- **C4 / C6 — the MR captures the location; Admin reviews it.** An MR adds a Doctor with their
  phone's GPS location, on one of their own Routes, offline-first: it is saved on the phone and
  sent later under a client-generated id so a retry can't create it twice. Admin can correct the
  location while approving. Admin adding a Doctor directly picks the location on a Google map, and
  that Doctor is active at once. On approval the Doctor is assigned to the MR who added it
  (`AUTO_ASSIGN_DOCTOR_ON_APPROVAL`, default `true`); Admin can reassign later.
- **C7 — `NEW_DOCTOR_COVERAGE_WAIT_DAYS` = 8**, counted from approval. Phase 4 stores the approval
  date; the coverage rule itself waits for Field Activity (Phase 6).
- **C8 — Doctor Service types** aren't needed until Phase 6.
- **Deactivating a Doctor** is refused while it has an active assignment; sample allocations stay
  as history. A Doctor's or Chemist's location may be empty, and an empty one means the geofence
  check can't run.

**Replaces:** the earlier assumption that Admin enters a Doctor's location at creation (C6), and
the open question of whether a Route change moves an MR's Doctors (C3).

**Why:** roadmap rule 6 — build on explicitly accepted assumptions rather than wait on the client.
Route-following is a config switch because it is a policy the client may reverse; hiding on read
means a config flip or a returned Route needs no data repair.

**Costs:** the MR's phone location may not be the clinic's, so Admin's review at approval is the
control. An offline create needs an idempotency id, so the add-Doctor endpoint depends on the same
client-id rule Phase 5's sync will use.

**Refs:** [`client-sign-off.md`](client-sign-off.md) C3, C4, C6, C7, C8,
[`LLD/field-master-data.md`](LLD/field-master-data.md)

---

## 2026-09-28 — HR's design: employee HQ in Territory, lazily seeded balances, a pending ledger

**Decision:** Three choices while planning the HR module:

- **An employee's HQ is a Territory-owned `UserHqAssignment`**, set by Admin or HR. At most one
  active row per FIELD user, with history kept like `RouteAssignment`. HQ- and Zone-scoped
  holidays read it through Territory's contract. An employee without one gets only National
  holidays.
- **Leave balances are seeded lazily, per leave year**, the first time HR needs them (a balance
  read or a leave request). The allocation is the Pay Band's `LeavePolicy` days, pro-rata for
  someone who joined during that leave year. The next leave year seeds itself.
- **`LeaveBalance` keeps `pendingDays` as well as `usedDays`.** Submitting reserves days with a
  conditional update, and the `LEAVE` kind's `onStatusChange` moves them on each decision, in
  the approval module's transaction.

**Why:**
- **HQ:** the Identity ERD pencilled an `hq_id` onto `EmployeeProfile`, but Identity (Tier 1)
  can't validate an HQ that lives in Territory (Tier 2). Territory can validate the user, so the
  assignment lives there. Deriving the HQ from an employee's routes was rejected, because a
  manager with no routes of their own would get only National holidays.
- **Lazy seeding:** "seed when the Pay Band is set" would need Identity to call HR, an upward
  dependency. Seeding on first need also removes any year-end job.
- **Pending ledger:** checking only `usedDays` would let two requests pending at once overdraw a
  balance.

**Refs:** `docs/LLD/hr.md`, `docs/LLD/territory.md`, `docs/erd/02-territory-master.md`, `docs/erd/07-hr-ops.md`

---

## 2026-09-28 — HR built on today's leave assumptions (F3, F11–F16)

**Decision:** The client hasn't answered how leave works in detail. These working assumptions
are accepted so HR can start (roadmap sequencing rule 6). A later client answer is a change, not
a gap, and the marked ones are configuration:

- **F3 — no probation rule.** Leave is allocated once the employee's grade (Pay Band) is set.
- **F11 — the leave year is the financial year**, from `FY_START_MONTH` (April), matching payroll
  and the FY toggle (HLD 09).
- **F12 — the weekly off day and holidays aren't counted** inside a leave range. The off day is a
  new `WEEKLY_OFF_DAY` key (Sunday). Holidays are those that apply to the employee's HQ/Zone plus
  national ones.
- **F13 — a mid-year joiner gets a share** of the grade default for the months left in the leave
  year, rounded to half days.
- **F14 — half-day leave is allowed** (first or second half).
- **F15 — leave can be applied up to 30 days back** (new key), within the current leave year —
  e.g. to cover a missed DCR before the compliance block (PRD §7.5).
- **F16 — too little balance is refused.** Loss of Pay has no balance and is always allowed.

The client's own leave types, which are paid, and the days per grade (F17) are data HR enters in
the app, so they don't block building.

**Why:** HR has no technical blocker; these are the rules the LLD left unstated. Deciding them now
keeps them out of ad-hoc code decisions.

**Refs:** `docs/client-sign-off.md` §F, `docs/LLD/hr.md`, `docs/hld/09-financial-year-toggle.md`

---

## 2026-09-28 — A rejected Plan gets a short window to be resubmitted

**Decision:** Adds to the late-Plan rule below. After a **rejection**, the employee may resubmit
past the deadline until the later of the deadline and the rejection time plus a grace period. Two
limits apply, whichever is reached first:

- **Daily Plan:** grace `DAILY_PLAN_RESUBMIT_GRACE_MINUTES` (30), never after
  `DAILY_PLAN_RESUBMIT_LATEST_TIME` (11:30) on the plan's date.
- **Monthly Plan:** grace `MONTHLY_PLAN_RESUBMIT_GRACE_HOURS` (24), never after the month has
  started.
- **Both:** at most `PLAN_RESUBMIT_GRACE_MAX` (2) resubmits through the window per Plan.

A rejection before the deadline gets the same window (09:50 → 10:20). The window follows a
rejection only, not the employee's own withdraw (which would let them buy time) and not an Admin
reopen. Once the window is closed or used up, the late-submission exception still applies. A
submit inside the window never uses an exception. All four values are SystemConfig.

**Why:** with every submit checked, a manager rejecting at 10:30 cost the MR the day unless
someone granted an exception. Telling managers to "reject early" isn't a rule anyone can enforce.
The count stops endless reject-and-resubmit rounds, and the time cap keeps the field day usable.

**Consequences:** Plans carry a `lateResubmits` count, raised in the submit transaction. Plan
views show `resubmitAllowedUntil` while a window is open. Existing environments need a re-seed for
the four new keys.

**Refs:** `docs/LLD/planning.md`, `docs/client-sign-off.md` B8

---

## 2026-09-28 — A late Plan is refused; a one-off exception overrides the deadline

**Decision:** A Daily or Monthly Plan submitted after its deadline is **refused** (`409
PLAN_SUBMIT_LATE`), not accepted and flagged. Every submit is checked, including a resubmit after
a rejection or withdrawal. The override is a **late-submission exception** (`LatePlanSubmitGrant`)
for one user and one Plan (a date or a month):

- **Admin** can grant it to anyone. A **manager** can grant it to someone in their downline only
  while `LATE_PLAN_GRANT_BY_MANAGER` is `true` (seeded `false`).
- A reason is required. It expires `LATE_PLAN_GRANT_VALID_HOURS` after it's granted (seeded `24`),
  covers **one** submit (used up in the same transaction as the submit) and can be revoked while
  unused.
- The employee still submits the Plan and it goes through normal approval. Nobody submits on the
  employee's behalf.
- Deadlines are read in `BUSINESS_TIMEZONE` (seeded `Asia/Kolkata`). A Daily Plan is due at
  `DAILY_PLAN_SUBMIT_CUTOFF_TIME` on its own date. A Monthly Plan is due at the end of
  `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` in the month before; a day past that month's end (e.g. 30 in
  February) means its last day.

**Why:** B4 already blocks the DCR until the Plan is approved, so a "late" flag that changed
nothing would be a deadline in name only. Lifting a rule is Admin's everywhere else too (B6
unblock, E2 stock reopen, F10 reopen). The manager switch exists because an Admin-only exception
could make Admin the 10:05 bottleneck for the whole org, and turning it on needs no code change.

**Rejected:** accept-and-flag (no teeth); applying the deadline to the first submit only (the
user chose every submit, so resubmits get no special rule); requesting an exception through a new
approval kind (two approval rounds for one day's Plan).

**Consequences:** a manager who rejects a Plan after the cutoff leaves the MR needing an
exception before they can resubmit, so rejecting early matters. Existing environments need
`pnpm --filter @greynote/api seed` to get the three new keys. Recorded as sign-off row B8.

**Refs:** `docs/LLD/planning.md`, `docs/erd/05-planning-and-rules.md`, `docs/client-sign-off.md` §B

---

## 2026-09-28 — Plan deadlines and the DCR gate built on today's assumptions (B1, B3, B4)

**Decision:** The client hasn't answered sign-off rows B1, B3 and B4. Their "Today" assumptions
are accepted explicitly, so Phase 4 Planning can start (roadmap sequencing rule 6):

- **B1 — Monthly Plan deadline: the 28th.** Read from `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE`, i.e. next
  month's plan is due by the 28th of the current month.
- **B3 — Daily Plan deadline: 10:00.** Read from `DAILY_PLAN_SUBMIT_CUTOFF_TIME`.
- **B4 — a missed Daily Plan blocks that day's DCR**, not just a notification. The gate opens once
  the day's `DAILY_PLAN` request is past the manager: `MANAGER_APPROVED` or `APPROVED`
  (Planning's `isDailyPlanApproved`, `LLD/planning.md`).

**The values are configuration, not code.** Both deadlines are already-seeded `SystemConfig` keys
that Admin can change at runtime (decision-log 2026-09-24); Planning reads them through
Config's `get(key)` on every submit and never hardcodes `10:00` or `28`. A client answer that
only changes a value is an Admin edit, not a release. B4 is a rule, not a value, and has no key.

**Why:** Planning is the approval module's first consumer and on the path to Phase 6's gate;
waiting on the client would stall both. These three are the rows Planning actually depends on.

**Consequences:**

- A **business timezone** is needed to say when "10:00" and "the 28th" are — the server has none
  (decision-log 2026-09-28, approval date filters). Planning adds it as a `SystemConfig` key
  (e.g. `BUSINESS_TIMEZONE`, default `Asia/Kolkata`), not an env var, when it builds the cutoffs.
- **Still undecided, and needed before Planning's submit use cases:** what happens to a Plan
  submitted after its deadline — refused, or accepted and flagged (`LLD/planning.md` write-path
  rules). Not covered by B1/B3.
- B2 (missed Monthly Plan blocks next month's DCR), B5–B7 stay as they are — they gate Phase 6,
  not Planning. Field Master Data (C) and HR (F) rows are unchanged.

**Refs:** `docs/client-sign-off.md` §B, `docs/roadmap.md` sign-off gate,
`apps/api/src/modules/config/application/usecases/seedDefaultConfig.usecase.ts`

---

## 2026-09-28 — Approvals are decided on a cycle; bulk isolates faults; date filters carry an offset

**Decision:** Three fixes from the Phase 3 review, before Planning becomes the first consumer:

- **A decision names the cycle it was made on.** `POST /approvals/:id/approve|reject` require
  `cycle`; `POST /approvals/bulk` takes `requests: [{ id, cycle }]` instead of `requestIds`. The
  conditional write matches status **and** cycle. Replaces the status-only guard.
- **Bulk never fails as a whole.** An unexpected error on one item (an unregistered kind, an
  owning module's `onStatusChange` throwing a plain `Error`) is logged at `error` and returned as
  that item's `500`; the other items still run. Previously it aborted the loop with a bare `500`
  after earlier items had already committed.
- **List `from` / `to` must be ISO date-times with an offset**, both inclusive. A bare date is a
  `400`. Replaces `z.coerce.date()`, which read `to=2026-09-28` as 00:00 UTC — dropping that day,
  and off by 5½ hours for IST.

**Why:** Withdraw + resubmit returns a request to `SUBMITTED` on a new cycle with a possibly
edited record, so a status-only guard let a manager approve content they never saw. The server
has no business timezone, so it cannot turn a bare date into a day; the client can.

**Consequences:** web and mobile clients send the `cycle` from the row they displayed, and send
local start/end-of-day instants. A business-timezone `SystemConfig` key is still needed for
Planning's 10:00 Daily Plan deadline (B3) — added in Phase 4, not here. No client existed yet,
so the contract change cost nothing.

**Refs:** `apps/api/src/modules/approval/`, `docs/LLD/approval.md`, `docs/hld/05-approval-workflow-engine.md` §8

---

## 2026-09-24 — Approval workflow switch is one list key; decision callbacks are transactional

**Decision:** Two refinements while building Phase 3 step 3:

- **One config key, not one per kind.** `APPROVAL_MANAGER_ONLY_KINDS` (seeded `NONE`) lists the
  kinds that end at the manager; every other kind is Manager → final. The planned per-kind
  setting (and a per-kind `defaultWorkflow` on registration) is dropped. Read at each
  (re)submission and snapshotted onto the request, so a change applies from the next cycle.
- **`onStatusChange` runs inside the same MongoDB transaction** as the status change it reports
  (decide, withdraw, reopen). The owning module writes through the passed context; if it
  throws, the approval change rolls back too. Submit/resubmit accept an optional context the
  other way round, so an owning module can save its record and submit in one transaction.
  `TransactionRunnerPort` / `TransactionContext` and the Mongoose runner move from Identity to
  `src/shared/db/` so a transaction can span modules.

**Why:** Kinds are registered at runtime by owning modules, but `SystemConfig` only lets Admin
edit keys that were seeded — a key per kind would have to be seeded before its kind exists. And
an after-commit callback could leave the approval saying "approved" while, say, the leave
balance was never deducted; one transaction makes that impossible.

**Consequences:** handlers must keep to database writes on the context (a transient-error retry
can run them twice); notifications go elsewhere (F8). Owning modules should read status from the
approval module (`getForRecord`) rather than keep their own copy.

**Refs:** `apps/api/src/modules/approval/application/applyTransition.ts`,
`apps/api/src/shared/db/`, `apps/api/src/modules/config/application/usecases/seedDefaultConfig.usecase.ts`

---

## 2026-09-24 — An Admin override at Stage 1 is a final approval

**Decision:** When Admin approves a request still waiting on the submitter's manager
(`SUBMITTED`), it goes straight to `APPROVED`, recorded with authority `ADMIN_OVERRIDE`.
**Reverses** HLD 05 §5, where the override applied only the Stage-1 transition (`SUBMITTED →
MANAGER_APPROVED`). A top-of-chain request (no manager) likewise ends in one step at the final
approver (`TOP_OF_CHAIN`), as PRD §7.1.4 already said. Only the manager's own approval stops at
`MANAGER_APPROVED` (and only when the kind's workflow has a final stage).

**Why:** Admin is the final authority on every kind. Under the old rule Admin would approve the
same request twice in a row — a second click, not a second check.

**Consequences:** HR gets no Stage-1 override, even on Leave — HR acts at the final stage, or
directly only when the submitter has no manager. The history's `authority` field always shows
which path a decision took.

**Refs:** `apps/api/src/modules/approval/domain/approvalRules.ts`, `docs/hld/05-approval-workflow-engine.md` §5

---

## 2026-09-24 — Phase 3: the approval engine becomes a module; Admin is a real second stage

**Decision:** Agreed with the product owner before building Phase 3, after reading the client's
`RULES BY GREYNOTE.docx` §19 against HLD 05:

- **An `approval` module (tier 2), not a shared library.** Reverses HLD 05 §1 and the roadmap's
  "not a module, not a tier". It owns an `ApprovalRequest` collection: kind, the owning module's
  record id, submitter, current stage/status, and a full action history (who, when, comment). The
  owning module (Planning, HR, …) creates the request and is called back on each decision through
  a handler registered at the composition root, so the lower tier never imports the higher one.
- **Stage 2 is a real approval, not record-keeping.** Status runs `SUBMITTED →
  MANAGER_APPROVED → APPROVED`, with `REJECTED` possible at either stage (client §19.3:
  "first immediate manager & then Admin"). Each owning module decides which status unlocks what
  for it (e.g. HLD 10's DCR gate needs only a Manager-approved Plan).
- **Per-kind workflow in `SystemConfig`**: `MANAGER_THEN_FINAL` (default) or `MANAGER_ONLY`, so
  the client can drop the second stage for high-volume kinds (e.g. Daily Plans) without a
  release — and the still-open F1 list doesn't block the build. Who may act at the final stage is
  fixed per kind in code: **ADMIN**, or **HR or ADMIN for Leave**.
- **Leave goes Employee → Manager → HR/Admin** (product owner, matching client §11.2). Reverses
  PRD §5.3 / `LLD/hr.md`'s "HR approves directly, bypassing the manager chain" — Leave now uses
  the engine like everything else.
- **Doctor creation goes Employee → Manager → Admin** (product owner; client §4.2, sign-off C4).
- **Approved means locked for the employee; Admin can override.** Once `APPROVED` (or
  `MANAGER_APPROVED` on its way there) the submitter can't edit or withdraw. Admin can reopen an
  approved request (reason required, history kept), and each owning module lets Admin edit its
  own approved records.
- **The approver is resolved when someone acts, from the submitter's *current* manager** — not
  snapshotted at submission — so a reassigned employee's pending items move to the new manager.
  Admin's standing Stage-1 override (entry below, 2026-09-23) still covers an inactive/absent
  manager. Needs Identity `getDirectReports` / `getDownline` (the Team tab needs them anyway).
- **Engine-wide rules:** a rejection needs a reason; the submitter can withdraw until the
  manager acts (client §11.4); a rejected request can be resubmitted as a new cycle on the same
  request, history kept; nobody approves their own request; managers and Admin can bulk-approve;
  decisions emit an event where notifications will plug in (F8 still open).

**Why:** the client wants one common approval screen (§19.6) across many kinds (§19.3: DCR,
Expense, Leave, Doctor Service, Doctor Creation/Location, Sample, Gift, Order, change requests).
A library leaves each kind's status in its own collection, so that screen and Admin's org-wide
queue (HLD 05 §5) would have to query and merge every module's collection; a module with one
collection answers both with one query and gives a uniform audit trail.

**Consequences:**
- HLD 05, `LLD/hr.md` (leave approval), the roadmap's Phase 3/4 text and the PRD §5.3 leave
  wording are superseded; HLD 05 is rewritten as part of the Phase 3 build.
- `.dependency-cruiser.cjs` `MODULE_TIERS` gains `approval` in tier 2 beside `territory`.
- Reopening an approved request must later respect a Finalized PayrollRun (Phase 7): a month
  already paid stays locked.

**Refs:** `docs/hld/05-approval-workflow-engine.md`, `docs/LLD/hr.md`, `docs/roadmap.md`,
`docs/client-sign-off.md` C4/F1/F9, client `RULES BY GREYNOTE.docx` §4.2, §11.2, §11.4, §19

---

## 2026-09-24 — Phase 2 (Territory) build decisions

**Decision:** Agreed with the product owner before building Territory:

- **Google Maps** (Places API (New) for search, Routes API for distance — the legacy Places /
  Directions APIs can't be enabled on new projects), behind `PlaceSearch` /
  `DistanceProvider` ports so a cheaper provider (Ola Maps, OSRM) is one adapter away. Tests use a
  fake adapter. Directions caps a request at 25 waypoints, so a Route accepts at most 25
  (origin + destination + 23 via).
- **The API proxies place search**: `GET /api/territory/places/search?q=`. The Google key never
  leaves the server, and waypoint entry is testable from Swagger before the web portal exists.
- **Distance is calculated during the save**, with a timeout (~5 s). Failure saves the Route as
  `FAILED`; Admin retries with `POST /api/territory/routes/:id/recalculate`. `PENDING` is dropped
  from `distance_status`: nothing runs in the background, so nothing is ever pending. A
  `revision` counter, bumped by every waypoint/distance write, makes concurrent edits safe (a
  stale revision is rejected, not silently overwritten). *(Planned as `waypointsVersion`; widened
  while building so a slow recalculation can't overwrite a manual override made meanwhile.)*
- **`distance_km` is used as-is for TA — no ×2 for the return trip.** Admin defines the route (or
  overrides the distance) to cover the full travel the company pays for.
- **Names are unique within their parent**, case-insensitive (Zone globally, HQ per Zone, Area
  per HQ, Route per Area). **Nothing is hard-deleted**: a Zone/HQ/Area can't be deactivated while
  it has active children, and a Route can't be deactivated while it has active assignments.
- **CSV bulk import for Zone / HQ / Area** (not Routes — each waypoint needs a confirmed map pin).
- **Client sign-off D5 answered: a Route always uses its Area's type.** No per-Route override.

**Why:** these were the points the LLD/HLD left open or contradicted (HLD 02 describes a blocking
call yet the ERD had a `PENDING` status; the LLD had no edit/deactivate endpoints and no retry for
a failed calculation). Round-trip handling was raised because TA money depends on it; the owner
chose to keep it an Admin data-entry concern rather than a rule in code.

**Consequences:**
- Admin must remember the no-×2 rule when entering or overriding distances; the system won't
  catch a one-way figure for a round-trip route.
- A `GOOGLE_MAPS_API_KEY` is needed in every environment that creates or edits Routes; without it
  routes still save, as `FAILED`.

**Refs:** `docs/LLD/territory.md`, `docs/hld/02-route-distance-calculation.md`,
`docs/erd/02-territory-master.md`, `docs/client-sign-off.md` D5

---

## 2026-09-24 — Field devices need Admin approval; Admin device actions and password reset

**Decision:** The client answered sign-off group A: password login for now, 2 devices for field
employees, Admin approval for new devices, Admin can remove / log out a device, no limit for
Admin/HR/Accountant, Admin-only password reset. **Reverses** the Phase 1 device rule ("count
active sessions; at the limit, block with 'log out from another device first'"):

- New `UserDevice` registry (FIELD only). **Every** new phone, the first included, becomes a
  `PENDING` request and can't log in until Admin approves it.
- `MAX_REGISTERED_DEVICES_FIELD` (replaces `MAX_ACTIVE_DEVICES_FIELD`, default `2`) counts
  pending + registered phones. At the limit a new phone is refused and **no** request is
  created; Admin must remove an old phone first. Logging out never frees a slot.
- A rejected phone is blocked for `REJECTED_DEVICE_TTL_DAYS` (default `7`); a MongoDB TTL index
  then deletes the rejection and the phone counts as new.
- `UserSession.revokedReason`: only reuse of a `ROTATED` refresh token counts as theft.
- Admin-only endpoints: pending queue, per-employee device list, approve, reject, remove, log out
  one phone, reset password.

**Why:** the client's rules (§20.3) want new devices controlled by Admin. Counting sessions let
an employee swap phones freely just by logging out. The revocation reason is needed because
without it, the first background refresh from a phone Admin removed would have been treated as
theft and logged the employee out of their other, legitimate phone.

**Consequences:**
- Existing field users (none in dev) would need their phones approved once after deploy.
- Two new phones logging in at the same instant could both pass the limit check before either
  request is written (limit + 1 pending). Not guarded; Admin simply rejects the extra one.
- The Android app must send `ANDROID_ID` etc. in the login body — documented in
  `LLD/identity.md` "Where `device_id` and `device_name` come from".

**Refs:** `apps/api/src/modules/identity/{domain/userDevice.entity,application/usecases/login.usecase,interface/devices.route}.ts`,
`docs/hld/04-authentication-and-sessions.md`, `docs/LLD/identity.md`, `docs/client-sign-off.md` A

---

## 2026-09-24 — `PayBand.daAmount` split into `hqDa` / `exStationDa` / `outStationDa`

**Decision:** Closes the code mismatch flagged in the entry below. `PayBand` now stores three DA
rates, one per `Area.type`, all `Decimal128` and all required on create. `daAmount` is removed
outright, not kept as an alias.

**Why:** Phase 6's DA calculation (HLD-06 §2) needs a rate per Area type, and the mismatch was
cheapest to fix now, while only Admin master data depends on `PayBand`.

**Consequences:** existing `PayBand` rows that only have `daAmount` can't be read by the new
adapter and need the three fields backfilled. Night Stay is still not a field, because its
trigger is still undefined.

**Refs:** `apps/api/src/modules/identity/{domain/payBand.entity,infrastructure/payBand.schema,infrastructure/mongoPayBand.adapter}.ts`

---

## 2026-09-24 — Territory, Distributor, Doctor assignment and DA re-aligned to the client's Master spec

**Decision:** **Reverses** four earlier design calls. None had a decision-log entry of its own;
each lived as a "locked" bullet in an ERD/LLD doc:

- **`Area` added: `Zone → HQ → Area → Route`.** Reverses ERD-02's "Three-level hierarchy, no
  Area" and `LLD/territory.md`'s "Area... considered and dropped". `Route.hq_id` becomes
  `Route.area_id`. `Area` carries `type: HQ | EX_STATION | OUT_STATION`.
- **DA is per Area type, not flat.** Reverses HLD-06's `da_amount = pay_band.da_amount`. Each
  grade has `hq_da`/`ex_station_da`/`out_station_da`, and a day's DA uses the rate for its routes'
  Area type (highest type wins if mixed; `MEETING`/`CONFERENCE` default to HQ — both provisional,
  see HLD-06 §2).
- **Distributor attaches to a Route, not an HQ.** Reverses ERD-03's "Distributor attaches at the
  HQ level". Also gains `latitude`/`longitude` (reversing "Distributor doesn't get this"),
  `gst_number`, `contact_person`, `mobile`, single-value `assigned_mr_id`/`assigned_asm_id`, and
  primary/secondary-sales flags. An MR can act on a Distributor if it's their `assigned_mr_id` or
  their `RouteAssignment` covers its Route. This resolves `LLD/sales-and-orders.md`'s open
  "territory gating on Order creation" question.
- **One active `DoctorAssignment` per Doctor.** Reverses ERD-03's "a doctor can have more than
  one MR assigned". The table stays, as history plus a partial unique index on active rows.
  Managers reach the doctor through the reporting chain, not extra rows.

Also added: `SystemConfig.MONTHLY_STOCK_SUBMISSION_DAY` (seed default `5`) as the Admin-set
cut-off for monthly Distributor stock entry.

Considered and **rejected** on the way: an `AreaAssignment` (MR↔Area) and `DistributorArea` join
to gate Distributor access by Area. The client spec gates by Route + a direct assigned MR, so a
second assignment mechanism would duplicate `RouteAssignment`. Also rejected: scoping each
manager designation to a territory level (ASM→Area, ZSM→Zone, NSM→national). Client rules §18
define manager visibility purely by reporting chain, which `getDownline` already does. Orgs
missing a level (no ZSM/NSM) are already covered by HLD-05 §2/§5's Admin fallback.

**Why:** the ERD/LLD were first written from the PRD alone. The client's own Master spec
(`MASTER V2.docx` M1/M2/M4/M6, `RULES BY GREYNOTE.docx` §8/§14–18/§31, `sales.docx` S6) is more
specific and disagreed on each point. The one-doctor-one-MR rule was answered directly by the
product owner in this discussion, not taken from the spec, where it's still an open question.

**Consequences:**
- **Code mismatch, not fixed yet:** `PayBand` (Identity, Phase 1, shipped) has one flat
  `daAmount`. It must become three per-area-type rates (plus Night Stay once its trigger is
  defined) before Phase 6 builds DA. The 2026-09-23 "`Decimal128`, provisional" entry already
  flagged `PayBand`'s money fields as revisable; this adds a concrete reason.
- Territory and Field Master Data aren't code yet, so their reshaping costs nothing now.
- Still open with the client, left unresolved in the docs rather than guessed: Night Stay DA
  trigger, holiday/weekly-off effect on DA, the mixed-area-type tie-break, whether a Route can
  override its Area's type, and approval-based re-open of a closed stock month.

**Refs:** `docs/erd/02-territory-master.md`, `docs/LLD/territory.md`,
`docs/erd/03-field-master-data.md`, `docs/LLD/field-master-data.md`,
`docs/hld/06-ta-da-auto-calculation.md`, `docs/LLD/sales-and-orders.md`,
`apps/api/src/modules/identity/domain/payBand.entity.ts`

---

## 2026-09-24 — `SystemConfig` gets an Admin write path; Admin gets blanket Stage-1 approval override

**Decision:** Two additions to the not-yet-built Planning/Approval design, both scoped ahead of
that module's implementation so neither gets built the old way first:

- **`SystemConfig` (Module 5, `hld/03` §3) gains an Admin-facing write path.** Today it only has a
  seed step and a read-only `getConfigValue` use case — nothing lets Admin actually change
  `DCR_MISS_GRACE_DAYS` from its default of `1` to `2` or `3`. A `PATCH` on a config key, ADMIN-only,
  closes that gap. No schema change — `SystemConfig.value` was already a plain string.
- **Admin gains a blanket override on Stage-1 approval** (`hld/05`), not just the existing
  `manager_id IS NULL` case. Any `SUBMITTED` record — Daily Plan, Monthly Plan, DCR — can be
  approved or rejected directly by any ADMIN-role user, regardless of who the nearest manager is
  or whether that manager can currently act.

**Why:** the second decision is the direct answer to "what happens when the nearest manager can't
approve" — resigned/deactivated, on leave, forgot, or simply unreachable. Detecting *which* of
those applies would mean new state on `User`/`EmployeeProfile` (an unavailability flag, a delegate
field, leave-calendar integration) and separate handling per case. A blanket, always-on Admin
override needs none of that: it's the same one mechanism regardless of reason, and it's already
consistent with `hld/05` §4's existing principle that Admin visibility is role-based, not
hierarchy-based — this just extends that principle one stage earlier, from read access on
`MANAGER_APPROVED` records to approve/reject action on `SUBMITTED` ones. The config write path is
bundled into the same entry because it's what makes the first, already-designed rule
(`DCR_MISS_GRACE_DAYS`) actually operable instead of a seed-only default.

**Consequences:**
- `hld/05` gains a `§5 Admin override` section; `LLD/planning.md`'s HTTP surface table gains
  `GET /admin/approvals/pending` (org-wide, filterable by `managerId` and date range — reusing
  `EmployeeProfileRepositoryPort.findUserIdsByFilter`, defined but unused today) and
  `POST /admin/approvals/:id/approve` / `/reject`.
- No new field on `DailyPlan`/`MonthlyPlan`/`DCR` to flag "admin override" — `reviewed_by` already
  points at whichever `User` acted, and that user's `roleId` being `ADMIN` is itself the signal.
  Revisit only if a future report needs to isolate overrides without that join.
- Documentation-only for now — Planning/Approval isn't code yet (only `config`, `health`,
  `identity` are real modules under `apps/api/src/modules/`). Recorded ahead of that build so it
  isn't designed without either rule.

**Refs:** `docs/hld/05-approval-workflow-engine.md` §5, `docs/hld/10-submission-gating-and-compliance-block.md` §2,
`docs/erd/05-planning-and-rules.md`, `docs/LLD/planning.md`

---

## 2026-09-23 — `Route.ta_per_km_rate_override`: a per-route default override for TA

**Decision:** `Route` (Territory, Module 2 — not yet built) gains an optional
`ta_per_km_rate_override: decimal, nullable` field. `PayBand.ta_per_km_rate` (Module 1) remains
the default; when a route has this set, it takes precedence for travel on that specific route.
TA/DA auto-calculation (`hld/06` §2) resolves the rate **per route**, not once for the whole day —
`ta_amount = sum over routes where CALCULATED of distance_km × (ta_per_km_rate_override ??
pay_band.ta_per_km_rate)` — since a `DailyPlan` can carry multiple routes, each potentially with
its own override. Unlike `Route.distance_km`'s `MANUAL_OVERRIDE`, this does **not** reset on a
waypoint edit (it's a negotiated fact, unrelated to geography) and needs no `_source`/`_status`
provenance pair — it's simply present or absent.

**Why:** lets Admin set a higher rate for a specific remote/difficult route without creating a
whole new `PayBand` grade just for it, matching how real per-km reimbursement negotiations
actually work.

**Consequences:** documentation-only for now — `Territory`/`Route` isn't code yet (roadmap Phase
2), and TA/DA calculation is Phase 6. Recorded ahead of both landing so neither implements the
old single-rate-per-day formula.

**Refs:** `docs/erd/02-territory-master.md`, `docs/hld/06-ta-da-auto-calculation.md` §2

---

## 2026-09-23 — Split `User` into a lean account + `EmployeeProfile`/`ComplianceBlock`

**Decision:** **Reverses** (per this log's append-only rule, the two entries below stay as
history, not edited) both the "Identity's `User` gains onboarding fields..." entry and the
"compliance block history embedded on `User`" direction from earlier the same day. `User` shrinks
to a lean account/org-identity record for every role: `employeeCode`, `name`, `email`, `phone`,
`status`, `roleId`, `passwordHash`, `lastLoginAt`, `isBlocked`. Two new collections take
everything else:

- **`EmployeeProfile`** — FIELD-only, one per `User`, created **lazily** on the first onboarding
  `PATCH` (not at `User` creation — `POST /users` never touches it). Holds
  `designationId`/`payBandId`/`managerId`/`dateOfJoining` (moved off `User` — all four were
  already FIELD-only in practice) plus the personal/bank/document onboarding bundle from the
  earlier entry.
- **`ComplianceBlock`** — one document per block **event**, not a single overwritable set of
  fields — a second block later in an employee's tenure no longer erases the first one's reason
  and timestamps. `User.isBlocked` stays as a fast top-level flag; the row is where the detail
  lives. Retention is **indefinite** — no TTL — matching how the rest of the system treats
  history (`hld/09`'s FY toggle only ever scopes what's shown, never deletes).

**Why:** `User` had accumulated a pile of fields that are always null for 3 of the 4 roles
(`ADMIN`/`HR`/`ACCOUNTANT` never touch onboarding data), and compliance-block history is
open-ended over an employee's whole career — both are exactly the kind of data worth separating
from an auth-critical record (`passwordHash`, `roleId`) before real data exists, the same
"decide before it's expensive to change" reasoning as the `Decimal128` money decision. Discussed
and confirmed along the way: dangling references aren't a new risk this split introduces —
nothing in this system is ever hard-deleted (`Role`/`Designation`/`PayBand` have no `DELETE`
endpoint, `User` is soft-deactivated, `UserSession` is soft-revoked) — and the two places
stale-value drift actually matters financially (`PayrollRun.base_salary`, generated TA/DA
`Expense` amounts) already have their own documented locked-snapshot rule, unaffected by this.

**Consequences:**
- `CreateUserInput` simplifies to one shape for every role
  (`{role, employeeCode, name, password, email?, phone?}`) — `designationId`/`payBandId`/
  `managerId` are no longer accepted at creation, only via the onboarding `PATCH`. `createUser`
  goes back to a single-collection write.
- `unblockUser` now writes to two collections (close the open `ComplianceBlock`, flip
  `User.isBlocked`) and does so inside **this codebase's first MongoDB transaction**
  (`TransactionRunnerPort`/`MongooseTransactionRunner`) — every other write in this system remains
  a single-document update, which MongoDB already makes atomic on its own.
- `listUsers`'s designation/manager filters and `UserSummary`'s designation/manager fields now
  require resolving `EmployeeProfile` — handled as a two-phase query (resolve matching `userId`s
  from `EmployeeProfile` first, then filter `User` by `_id`), not a `$lookup` aggregation —
  simpler to reason about and sufficient for this filter's low, Admin-driven query volume.
- A new `GET /api/identity/users/:id` endpoint exists now, since `UserSummary` never carried
  personal/bank details and nothing else exposed a user's full onboarding profile.
- `docs/erd/01-identity-hierarchy.md` and `docs/LLD/identity.md` are rewritten to describe the new
  shape rather than the one from earlier today.

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,employeeProfile.entity,complianceBlock.entity,transactionRunner.port}.ts`,
`apps/api/src/modules/identity/application/usecases/{createUser,updateUser,unblockUser}.usecase.ts`

---

## 2026-09-23 — Bootstrap Admin via an interactive seed script, not env vars

**Decision:** **Reverses** the "Bootstrap Admin seeded from env vars, exactly once" entry below,
from the same day. `BOOTSTRAP_ADMIN_EMPLOYEE_CODE`/`_NAME`/`_EMAIL`/`_PHONE`/`_PASSWORD` are
removed from `env.ts`'s schema entirely. In their place, `apps/api/src/scripts/seed.ts` — a
second composition root alongside `container.ts`, exactly the shape
`docs/engineering/module-anatomy.md` anticipated for "a worker process, a script" — seeds
`SystemConfig` defaults and the 4 fixed `Role` rows, then, only if no `ADMIN` user exists yet,
**interactively prompts** an operator for the first Admin's details (password entry masked, typed
twice) rather than reading them from environment configuration. Run via `pnpm --filter
@greynote/api seed` in dev, or `node dist/scripts/seed.js` inside the running container in prod
(`docker compose exec`). `buildContainers()` in `container.ts` no longer calls any seed method —
server boot does zero DB writes as a side effect of starting.

**Why:** the env-var approach meant a plaintext admin password had to sit in `apps/api/.env.prod`
for the entire life of a deployment, readable by anything with host/container access, long after
it served its one purpose. It also meant every server process did DB write queries on boot as an
implicit side effect of starting up. Neither is a correctness bug — the seeding itself was
already idempotent (`$setOnInsert` for Config, existence-checks for Role and the bootstrap Admin),
so a restart never clobbered an Admin's edits — but "seed the database" deserves to be an
explicit, operator-triggered action, the same way a schema migration is, not invisible behavior
baked into `npm start`.

**Consequences:** `apps/api/.env.example` and `.env.prod.example` lose the `BOOTSTRAP_ADMIN_*`
block. A fresh environment (dev or prod) needs one manual `pnpm --filter @greynote/api seed` /
`node dist/scripts/seed.js` run before the first login attempt — documented in
`setup-development.md` and `manual_deploy.md`. `esbuild.config.mjs` gained a second entry point
(`src/scripts/seed.ts` → `dist/scripts/seed.js`) so the script ships in the prod image alongside
`dist/server.js`. New runtime dependency: `prompts` (masked password input) — a real
`dependencies` entry, not `devDependencies`, since the script must run from the prod image's
`pnpm deploy --prod` node_modules, not just via `tsx` in dev.

**Refs:** `apps/api/src/scripts/seed.ts`, `apps/api/src/container.ts`,
`apps/api/src/modules/identity/identity.container.ts`,
`docs/engineering/module-anatomy.md`

---

## 2026-09-23 — Identity's `User` gains onboarding fields, a `pending` status, and defers Zone/HQ

**Decision:** `User` (ERD Module 1) grows beyond `docs/erd/01-identity-hierarchy.md`'s original
field list to support a step-by-step Admin onboarding flow for FIELD employees: personal details
(`mobile_number`, `guardian_name`, `date_of_birth`, `address`, `qualification`), bank details
(`bank_name`, `ifsc`, `account_number`, `account_holder_name`, `branch_name`), and an array of
uploaded documents. `status` widens from `active/inactive` to `active/pending/inactive` —
`pending` means onboarding incomplete, kept distinct from `inactive` (deactivated/offboarded) so a
future Payroll query for "active FIELD employees" can't accidentally include someone
mid-onboarding. `status` is auto-computed (not a separate "activate" action) every time
`PATCH /api/identity/users/:id` changes one of the required-for-activation fields — see
`domain/onboarding.ts`'s `computeUserStatus`, which never upgrades an already-`inactive` user back
to `active`/`pending` as a side effect. Zone→HQ is deliberately **not** added here — Territory
(Phase 2, one tier above Identity) doesn't exist yet, and ERD-01's own "Next" section already
planned for that FK to land with Module 2, not Module 1.

**Why:** the PRD/ERD didn't originally specify these fields, but real Admin onboarding needs them,
and a FIELD employee shouldn't be usable (assignable, able to submit) until the record is actually
complete. Auto-computing status (rather than a manual activate call) means every onboarding PATCH
naturally converges on `active` the moment the last required field lands.

**Consequences:** `docs/erd/01-identity-hierarchy.md` needs its `User` entity and `status` field
updated to match this. `docs/LLD/identity.md`'s HTTP surface table gains
`POST /users/:id/documents` and `DELETE /users/:id/documents/:documentId`, and its create-user
row should note the discriminated payload shape (decision below).

**Refs:** `apps/api/src/modules/identity/domain/{user.entity,onboarding}.ts`

---

## 2026-09-23 — One `POST /api/identity/users`, discriminated by role

**Decision:** the LLD's single `POST /api/identity/users` endpoint takes a Zod discriminated
union on `role`: a `FIELD` payload accepts the full onboarding shape (minimal at creation,
filled in incrementally via `PATCH`); an `ADMIN`/`HR`/`ACCOUNTANT` payload — the "user master"
path — is the short form (`employeeCode, name, email, phone, password, role` only), created
`active` immediately. Creating a non-FIELD user is Admin-only; creating a FIELD user is Admin or
HR, per the LLD's existing HR-field-force-only restriction. Enforced in `CreateUserUseCase`, not
just at the route.

**Why:** keeps the one HTTP surface the LLD already documents rather than adding a second
endpoint, while still giving Admin/HR/Accountant creation ("user master") a genuinely simpler
shape than FIELD onboarding — none of designation/pay-band/bank/manager/documents applies to them.

**Refs:** `apps/api/src/modules/identity/application/usecases/createUser.usecase.ts`,
`interface/users.schemas.ts`

---

## 2026-09-23 — Password hashing: bcrypt, with its 72-byte limit enforced not truncated

**Decision:** `bcrypt` (the `bcrypt` npm package, cost factor from `BCRYPT_COST_FACTOR`, default
12) hashes every `User.passwordHash`. Its 72-byte input limit is enforced at the Zod DTO layer
(`Buffer.byteLength(password, 'utf8') <= 72`, rejected with 400) on both password creation and
login — not silently truncated, which would otherwise let two different passwords sharing the
same first-72-byte prefix hash (and authenticate) identically.

**Why:** `docs/engineering/tech-choices.md` and `.env.example` had left bcrypt vs. argon2 open.
bcrypt ships prebuilt native bindings for common deploy targets (no build-toolchain risk the way
`argon2`'s native addon can carry) and is the specific standard for password hashing.

**Refs:** `apps/api/src/modules/identity/infrastructure/bcryptPasswordHasher.adapter.ts`,
`interface/password.schema.ts`

---

## 2026-09-23 — Bootstrap Admin seeded from env vars, exactly once

**Decision:** `identity`'s boot sequence seeds exactly one `ADMIN`-role `User` from
`BOOTSTRAP_ADMIN_*` env vars, gated on "does any ADMIN-role user exist" (not a one-time flag, so
it self-heals if the DB is ever reset) rather than a fixed run-once marker. Every Admin/HR/
Accountant after that first one is created the ordinary way — through that Admin's own
authenticated `POST /api/identity/users` call.

**Why:** creating a `User` normally requires an authenticated Admin, which is impossible on a
genuinely empty DB — this is the one exception, solving the chicken-and-egg problem without a
second, permanently-open creation path.

**Refs:** `apps/api/src/modules/identity/application/usecases/seedBootstrapAdmin.usecase.ts`

---

## 2026-09-23 — Money storage: `Decimal128`, provisional pending Payroll

**Decision:** `PayBand.base_salary/ta_per_km_rate/da_amount` (the first money fields to land) use
Mongoose `Decimal128` in `infrastructure/payBand.schema.ts`. The domain entity keeps them as
decimal **strings** — `domain/` never imports Mongoose (2026-09-19 decision) — so the conversion
lives only in `infrastructure/mongoPayBand.adapter.ts`.

**Why:** `docs/engineering/coding-standards.md#money` flagged this as undecided but required
before Phase 1, and named `Decimal128` as its own standing fallback pending a final choice against
driverzone's integer-subunit convention. Deliberately **provisional** — this entry exists so
Payroll (Phase 7) either ratifies or deliberately overrides it, not silently inherits it.

**Refs:** `docs/engineering/coding-standards.md#money`,
`apps/api/src/modules/identity/infrastructure/{payBand.schema,mongoPayBand.adapter}.ts`

---

## 2026-09-23 — MongoDB Atlas in every environment; no local Mongo container

**Decision:** `MONGO_URI` points at a MongoDB Atlas cluster in both development and production.
`docker-compose.dev.yml` and `docker-compose.prod.yml` define **no `mongo` service** in either
file.

**This reverses the pattern in the sibling reference project `../driverzone`**, which runs Mongo
as a local single-node replica set in `docker-compose.dev.yml` (with a one-shot `mongo-init`
container to promote it) for development, and a Docker-network-only Mongo service in
`docker-compose.prod.yml` for production.

**Why:** an Atlas cluster is already a replica set, so none of driverzone's `mongo-init`/
`directConnection=true` single-node bootstrap is needed here even if a module later needs
multi-document transactions. It also means one fewer moving part in local development — no
`docker compose up` before `pnpm dev`, no "did the replica-set init run" troubleshooting entry —
and production gets Atlas's managed backups and monitoring instead of a self-managed volume on
the deploy VM.

**Consequences:** `docs/setup-development.md` has no "start the dev stack" step; first-time setup
is `.env` pointing at a dev Atlas connection string, then `pnpm dev`. Clearing local dev data is
dropping collections on the Atlas dev cluster, not `docker compose down -v`. Production deploys
need the VM's egress IP allowlisted on the Atlas project before the API container can connect —
documented in [`manual_deploy.md`](manual_deploy.md). Every developer and every deploy target
needs network access to Atlas, which a fully offline/local-only setup (driverzone's default) does
not require.

**Refs:** `docker-compose.dev.yml`, `docker-compose.prod.yml`, `apps/api/.env.example`,
`apps/api/.env.prod.example`, [`setup-development.md`](setup-development.md)

---

## 2026-09-23 — Web portal is Next.js

**Decision:** `apps/web` (Admin/HR/Accountant portal, [`roadmap.md`](roadmap.md) phase 9) is
built on Next.js, matching `../driverzone/apps/web`'s stack and deploy pattern (standalone
output, `NEXT_PUBLIC_*` as Docker build args, same-site cookie auth if the eventual auth design
uses one).

**Why:** no HLD doc had picked a web stack yet — only the mobile stack was decided
(`hld/03-system-architecture.md` §1: React Native + SQLite). `apps/api`'s architecture was
already deliberately aligned to driverzone's (commit `041c5bd`), and Next.js is the specific
choice that keeps the eventual `build-and-deploy.md` and Dockerfile structure a copy of a proven
pattern rather than a second one to maintain.

**Consequences:** none yet — `apps/web` is not scaffolded. This entry exists so the choice is
recorded before Phase 9 starts, not discovered mid-scaffold.

**Refs:** [`roadmap.md`](roadmap.md) phase 9, [`engineering/tech-choices.md`](engineering/tech-choices.md)

---

## 2026-09-19 — Architecture aligned with the driverzone reference (shared kernel, module boundaries, tooling)

**Decision:** `apps/api` adopts the same architecture as `../driverzone/apps/api`: 4-layer
modules (`domain/application/infrastructure/interface`), a `.container.ts` composition root and
a `.public.ts` contract per module, and a `dependency-cruiser`-enforced tier graph
(`MODULE_TIERS`) mapping the 9 ERD modules onto explicit dependency tiers.

**Why:** the same shape had already proven out on a different product, and the specific problem
it solves — a module reaching into another's internals instead of a typed contract — is exactly
as real in a modular Mongoose monolith as it was there. Reusing a working pattern rather than
inventing a second one for a second product.

**Consequences:** `docs/hld/03-system-architecture.md` documents the tier mapping for greynote's
9 modules; `docs/engineering/` (this repo's engineering handbook, written to mirror driverzone's)
documents the pattern itself. The `health` module is the reference implementation every future
module copies from.

**Refs:** commit `041c5bd`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md),
[`engineering/module-anatomy.md`](engineering/module-anatomy.md)

---

## 2026-09-19 — Mongoose over the prior data-access approach

**Decision:** MongoDB via Mongoose is the persistence layer; Mongoose schema validation is the
primary validation at the persistence boundary, applied only inside each module's
`infrastructure/` adapter.

**Why:** captured in the PRD's switch-to-Mongoose commit; the ERD's ORM-agnostic entity language
(FK/join-table style) maps onto MongoDB with referential integrity enforced in the repository
adapters rather than the database, per `hld/03-system-architecture.md` §4.

**Consequences:** `domain/` and `application/` layers never import Mongoose — domain entities
stay plain TypeScript types — so a schema/model always lives in exactly one module's
`infrastructure/`, never shared, per `module-internals-are-private`.

**Refs:** commit `d52b99e`, [`hld/03-system-architecture.md`](hld/03-system-architecture.md) §4
