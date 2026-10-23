# Mobile — Team (the manager's daily operations)

**Plan, 2026-10-12; built the same day (T1–T12 ✅). Client answers recorded 2026-10-12 (section 8).** What a manager (ASM → RSM → ZSM → NSM, a FIELD employee with a downline) needs to run the day and watch the team from the **Team** section, what the server and web already give them, and what is still missing. Nothing here is built yet; this is the plan to agree before any code. Related: [`inbox.md`](inbox.md), [`reports.md`](reports.md), [`dailyplan.md`](dailyplan.md), [`monthlyplan.md`](monthlyplan.md), [`dcr.md`](dcr.md), [`leave.md`](leave.md), [`expenses.md`](expenses.md), [`secondary-and-targets.md`](secondary-and-targets.md), [`doctors.md`](doctors.md). Rules: [`prd.md`](../prd.md) §6–§7.1, [`decision-log.md`](../decision-log.md).

**Status key:** ✅ exists on the server. 🟡 exists but not open to a manager, or not shaped for a team. ❌ missing (we build it). 📱 the phone team shows it.
**Field app layout, redesigned 2026-10-13 (typechecked and linted, not yet run on a phone):** the Team tab has three sections instead of a tile grid. **Approvals:** *To approve* and *All team requests*, type chips with the counts from `/approvals/inbox/summary`, and filters by person, period, status (second list) and overdue; "Whose" is *All my team / My direct reports / Their teams*; bulk approve and reject, with "Select all <n> <type>"; Secondary sales now has a label. **People:** today's four numbers (pending approvals, not started, on leave, blocked), the team as a list that drills into managers (breadcrumb, roll-up line per manager such as "8 people · 2 not started · 1 blocked", counted on the phone from `/team/members` and `/team/today`), search and role filters, "You decide / View only" on each row, Unblock on a blocked row. **Person page:** quick actions (unblock, late exception, set a target, set a doctor visit target) and "See their…" links (daily reports, plans, leave, orders, stock), each opening the existing screen already filtered to that person. **Reports:** a plain list - Today board, Plans, Daily reports; Monthly overview, Leave calendar, Orders, Stock and secondary; Manage: Late exceptions, Visit targets, Unblock. Every earlier screen is still reachable.

**Earlier check, same day:** the person page and approvals inbox existed with the tiles. Fixed today: Overview read `items` but the server sends `rows`, and calls-per-day can be `null`. Section 5 item 5 (actions on a person) is built: unblock, late plan or expense, set a target (Targets screen, with remove), and set a doctor visit target. Push (FCM): server built 2026-10-15, see [`notifications.md`](notifications.md); the phone is open.

**Manager's own Daily Plan, 2026-10-14:** a manager picks team members to work with and plans the day from their routes and doctors - [`dailyplan.md`](dailyplan.md) section 1b. `GET /team/plans` rows carry `dailyPlan.changedFromMonthly` (the employee changed the day the Monthly Plan wrote; show a chip). A manager's target and achievement are the total of the MRs in their team - [`secondary-and-targets.md`](secondary-and-targets.md) section 2.

**Goal:** a manager can run **daily operations** (approve what is waiting, unblock people, grant exceptions) and **monitor the team** (who is working, who is behind, how sales and visits compare with target) from the phone (through the API), without Admin.

## 1. Scope

- **Managers do not use the web portal** (PRD §4; portal login stays Admin / HR / Accounts). No manager screens on the web.
- **The phone app is another team's.** We do not build or change it. We build the **API** and write this note as the contract they build against, the same as the other notes in this folder.
- Admin already sees every team through the existing portal (Approvals, Reports, Sales Dashboard); nothing new is planned on the web except what a new route might need there, to be decided per route.
- So "the Team section" below means what the phone team will show, driven by the routes in section 2.

## 2. Routes at a glance (kept current)

Everything a manager's phone calls, in one place. **Available** = built and tested; **Needed** = not built yet (the gap number is in section 4). All need a signed-in FIELD employee; "team" routes cover only the caller's downline, and a `userId` outside it is `403` (never an empty list). Lists page with `page` and `pageSize`; the answer is `{ items, page, pageSize, total, totalPages }` unless noted. Dates are `YYYY-MM-DD`. `scope` is `direct` (depth 1, the people they approve for), `indirect` (deeper, read-only) or `all` (default).

### Available — new for the Team section

| Route | What it answers |
|---|---|
| `GET /team/members?scope&status=active\|all&search&userId&page&pageSize` | The roster (`userId` = just that person, shown whatever their status). Row: `id, employeeCode, name, designation, status, depth, isManager, managerId, hq{id,name}, zone{id,name}`. Nearest first, then by name. |
| `GET /team/today?date&scope&userId&state&attention&page&pageSize` | Each active person's day. `date` is today (default) or earlier; a future day is `400`. Result: `date`, `notStartedAfter` (`HH:mm`), `tiles` (counts for the **whole level**, ignoring `state`/`attention`/paging: `total, blocked, noPlan, attention` and one per state), and `items`. Row: `user{id,employeeCode,name,depth}`, `state`, `plan{status,workingType,routeCount,routes[{id,name,routeType}],doctorCount}\|null`, `dcr{status,doctorCalls,chemistCalls,followups}\|null`, `leave{leaveId,leaveType,status,startDate,endDate}\|null`, `blocked`, `attention`. Sorted attention first, then state, depth, name. |
| `GET /team/plans?date&scope&userId&planStatus&page&pageSize` | Daily Plan for any day (tomorrow included) per active person: `dailyPlan{status,workingType,routeCount,routes[{id,name,routeType}],doctorCount,changedFromMonthly}\|null` and `monthlyPlanStatus` for that month. `routes` (2026-10-22): the day's routes named, `routeType` `HQ`/`EX_STATION`/`OUT_STATION` (a route that no longer exists is left out; `routeCount` still counts it). `planStatus` = a status or `NONE`. Result also has `date`, `month`, `counts` (everyone, by status; `NONE` = no plan). |
| `GET /team/leaves?from&to&scope&userId&status` | Leaves touching a window of at most 93 days (waiting, manager-approved or approved; rejected and withdrawn are left out). Not paged: `{ from, to, items }`. Row: `leaveId, leaveType, startDate, endDate, half, daysCount, status, user{…}`. A calendar, not the decision queue (that is Approvals). |
| `GET /team/orders?from&to&scope&userId&status&outletType&page&pageSize` | The team's orders in a window of at most 93 days, newest first. Row: `id, user{…}, outlet{type,id,name}, orderDate, status (PLACED\|DONE\|CANCELLED), totalAmountPaise, itemCount, remarks`. Also `from`, `to`, `totals{count, amountPaise (Placed + Done; Cancelled left out), byStatus{PLACED,DONE,CANCELLED:{count,amountPaise}}}` for everything matched (not just the page) and `truncated` (true if one person has more than 500 orders in the window, so the totals are short: narrow it). Orders now also include ones the office added or changed (`GET /sales/orders/:id` carries `createdBy`, `editedBy`, `editedAt`). Chemist orders are information only; a distributor order is marked Done or Cancelled by the MR who placed it, so a manager only reads here. One order in full: `GET /sales/orders/:id` (a manager may open their downline's). |
| `GET /team/stock?month&scope&userId&missingStock&secondary&page&pageSize` | Per active person for a month: `missingOutlets[{type,id,name}]` (chemists and distributors on their routes with **no** stock count), `secondary` (`NOT_ENTERED`, `DRAFT`, `PENDING` = sent to the manager, `APPROVED`, `REJECTED`) and `waitingOnYou` (a direct report's sent month; decide it in Approvals, kind `SECONDARY_SALES`). People with something to chase come first. Also `month` and `tiles{total, withMissingStock, secondary{…counts}}` for the whole level, whatever the filter. A report to chase people with, not a block. |
| `GET /team/members/:id/summary?month` | The person page in one read: `member` (the roster row), `date`, `today` (the `/team/today` row for them), `month` (default: this month) and `overview` (their Team Overview row for that month; `null` for someone who has left). `403` for anyone outside the downline. Their plans, reports, expenses, leave and doctors are the routes in the other tables with this person's id. |
| `GET /reports/team/overview?month&scope&userId&search&page&pageSize` | **The team's overall report.** One row per person for a month (a running month is read up to today). Row: `employee{id,name,employeeCode}`, `designation`, `zone`, `routes[]`, `workingDays` (not holiday, off, leave or before joining), `plan{submitted,approved}` and `dcr{submitted,approved}` over those days, `taPaise`, `daPaise`, `targetPaise`, `achievedPaise` (null = none set / nothing entered), `primaryPaise`, `field{reportedDays,lateDays,doctorCalls,chemistCalls,followups,calls,callsPerDay,unconfirmed,notInPlan,offRouteCalls,geofence{pass,fail,unverified,override}}` (reported days only), `attendance{present,leave,absent,strike,off}`. Also `totals` for everyone matching (not just the page), `from`, `to`, and paging. Manager only sees the downline; a manager with no team gets `403`. Honours `X-Financial-Year`. |
| `GET /approvals/inbox/summary` | The badge: `{ total, overdue, byKind[{kind,count,overdue}] }`. |

**Day states** in `/team/today`: `REPORTED` (DCR submitted or approved), `WORKING` (some call or follow-up logged, report not in), `NOT_YET` (nothing logged, before the not-started time), `NOT_STARTED` (nothing logged, after it), `MISSED` (a past day with no report), `ON_LEAVE` (a manager-approved or approved leave covers it), `OFF` (holiday or weekly off). Work logged on a leave or off day still counts as `WORKING` / `REPORTED`. `attention` is true when the person is blocked, `NOT_STARTED`, `MISSED`, or has no Daily Plan on a day they are not on leave or off. The not-started time is the Admin setting `TEAM_NOT_STARTED_AFTER` (default `11:00`, business timezone); it only changes this screen.

### Messages the manager receives (in `GET /inbox`, no new route)

The server puts these in the manager's Inbox ([`inbox.md`](inbox.md)) — the phone just shows them like any message and refreshes the unread count. Each is also pushed to the phone ([`notifications.md`](notifications.md)); the phone still polls. A background job checks every 5 minutes; each request is announced **once** (a resubmission after a rejection counts again). Admin can switch all of it off with the setting `TEAM_ALERTS_ENABLED` (default on).

| When | `kind` | Title / body |
|---|---|---|
| A direct report sends a **leave request, monthly expenses or a new doctor** | `UPDATE` | "Asha sent a leave request", or "3 new requests from your team" with a line per person (up to 8, then "…and N more"). One message per manager per check, so a busy moment is not a flood. |
| Any request (any kind) has waited at the manager **longer than `APPROVAL_SLA_DAYS`** | `REMINDER` | "A request is waiting too long" / "N requests are…", one line each with the number of days. Only a reminder: nothing is approved or escalated. |
| The missed-report job **blocks** someone on the team (direct reports only) | `UPDATE` | "Asha is blocked" with the missed dates, and where to unblock (Team → the person → Unblock, with a reason). |

Daily plans, monthly plans, daily reports, secondary sales and doctor services are **not** announced one by one (many a day); they are in the badge (`GET /approvals/inbox/summary`) and the overdue reminder. Messages last 14 days. They name no one outside the manager's own direct reports.

### Available — already there, used by the Team section

| Route | Use |
|---|---|
| `GET /approvals/inbox`, `GET /approvals/team?scope`, `GET /approvals/:id` | Waiting for me (direct reports, Stage 1), the downline's history, one request in full. |
| `POST /approvals/:id/approve`, `/reject` (reason required), `POST /approvals/bulk` (≤ 100) | Decide. Send the `cycle` you displayed. |
| `GET /field-activity/dcr/team?from&to&userId`, `GET /field-activity/dcr/:id` | The team's daily reports; one in full. |
| `GET /field-master-data/doctors/team?userId`, `PATCH /field-master-data/doctors/:id/review`, `PATCH /field-master-data/doctors/:id/targets` | The team's doctors; review an added doctor; set a visit target. |
| `GET /reports/sales-dashboard`, `/reports/employee-sales?userId`, `/reports/doctor-visits` | Targets vs sales, per person, visit frequency and missed calls (downline). **From 2026-10-14 sales are valued at PTS (not PTR)**; `employee-sales` adds `distributors[]` (the person's Done orders by distributor) and the flags are `NO_PTS` / `NO_PTS_CHANGE`. The Accountant also reads these on the web; nothing changes for a manager. |
| `GET /sales/employee-sales?userId&month` | One person's entered secondary sales. |
| `GET /field-activity/expense-months?month&userId`, `GET /hr/leave-balances/:userId?year` | One person's expense month; leave balance. |
| `POST /identity/users/:id/unblock`, `POST /planning/late-grants` (+ `/revoke`), `POST /field-activity/expense-grants` | Unblock with a reason; allow a late plan (only while `LATE_PLAN_GRANT_BY_MANAGER` is on) or late expense. |

### Needed — not built yet

| Gap | Route (proposed) | For |
|---|---|---|
| — | push notification (FCM) | ✅ server 2026-10-15 ([`notifications.md`](notifications.md): token route, team reminders, approvals digest). The phone registers the token and opens the routes. |

## 3. What exists today

| Need | What is there | Status |
|---|---|---|
| Approve / reject | `GET /approvals/inbox` (direct reports' requests at Stage 1, oldest first, `canAct`, `overdue`), `GET /approvals/:id`, `POST /approvals/:id/approve` and `/reject` (reason), `POST /approvals/bulk`. Kinds today: Daily Plan, Monthly Plan, DCR, Leave, Monthly Expenses, Secondary Sales, New Doctor, Doctor Service. | ✅ |
| See the whole downline's requests | `GET /approvals/team?scope=direct\|indirect\|all`; only direct reports have `canAct`; deeper levels are read-only (PRD §7.1.3). | ✅ |
| Team's daily reports | `GET /field-activity/dcr/team?from&to&userId` (downline, read-only); `GET /field-activity/dcr/:id` for calls, GPS, follow-ups, expenses. | ✅ |
| Team's doctors | `GET /field-master-data/doctors/team?userId`; review an MR-added doctor; set a doctor's visit target. | ✅ |
| Sales Dashboard | `GET /reports/sales-dashboard` already lets a manager read **their downline** (and refuses a FIELD user with no team). Targets vs achievement, field employees only. | ✅ server, 📱 |
| Per-employee sales and targets | `GET /reports/employee-sales` (manager reads downline; can set targets for them); `GET /sales/employee-sales?userId&month`. | ✅ |
| Doctor-visit frequency, missed calls | `GET /reports/doctor-visits` (self + downline). | ✅ |
| One person's expense month, leave balance | `GET /field-activity/expense-months?month&userId` and `GET /hr/leave-balances/:userId` accept anyone up the manager chain. | ✅ |
| Daily operations tools | Unblock a blocked employee (reason kept as audit) `POST /identity/users/:id/unblock`; late-submission grants for plans (`POST /planning/late-grants`, only while `LATE_PLAN_GRANT_BY_MANAGER` is on) and for expenses (`/field-activity/expense-grants`). | ✅ |
| Overdue flag | Every list row carries `dueAt` / `overdue` (`APPROVAL_SLA_DAYS`); flag only, nothing auto-escalates. | ✅ |

## 4. The gaps (what must be built)

These are why a manager cannot yet "monitor the team": the data exists, but there is no team-wide read, or the route is Admin-only.

| # | Gap | Today | Proposed (server) |
|---|---|---|---|
| T1 | **Team roster.** | ✅ built | `GET /team/members?scope=direct\|indirect\|all&status=active\|all&search&page&pageSize` → page of `{ id, employeeCode, name, designation, status, depth, isManager, managerId, hq, zone }`. FIELD only; a manager with no team gets an empty page. See [`LLD/team.md`](../LLD/team.md). |
| T2 | **Today at a glance.** | ✅ built | `GET /team/today` (section 2). |
| T3 | **Pending count / badge.** | ✅ built | `GET /approvals/inbox/summary` → `{ total, overdue, byKind: [{ kind, count, overdue }] }` for what waits on the caller (manager: direct reports at Stage 1). No paging, no `X-Financial-Year`. Poll when the app opens and after a sync; there is no push. |
| T4 | **Team plans.** | ✅ built | `GET /team/plans` (section 2). |
| T5 | **Team overall report.** | ✅ built | `GET /reports/team/overview` (section 2): the Sales Dashboard's columns plus calls, follow-ups, late and unconfirmed, and attendance counts. |
| T6 | **Team leave calendar.** | ✅ built | `GET /team/leaves` (section 2); new HR read `listLeavesForUsers`. |
| T7 | **Team orders.** | ✅ built | `GET /team/orders` (section 2). Note: the existing `GET /sales/orders` already returns the caller's own orders **and**, for a manager, their whole downline's mixed together, without names or totals. The employee's own screen should not rely on that; the Team section uses this route. |
| T8 | **Team stock / secondary status.** | ✅ built | `GET /team/stock` (section 2). `GET /sales/monthly-stock/missing` already worked for a manager (their downline only); the new route adds secondary status, names the people and pages. |
| T9 | **Person drill-down.** | ✅ built | `GET /team/members/:id/summary` (section 2), plus a `userId` filter on `/team/today`, `/plans`, `/leaves`, `/members`, and `/reports/team/overview`. |
| T10 | **Access check, single source.** | ✅ built | `resolveTeamScope` in `shared/access/teamScope.ts`: the whole downline, or one named person who must be in it (else `403`). Every new team route uses it. Existing routes (`/dcr/team`, doctors `/team`) keep their own copies for now. |
| T11 | **Reports after a team move.** Reports must show the team as it was in that month (sign-off K18). | ✅ design, check | Verify the new team reads use the dated manager history, not today's `managerId`. |
| T12 | **Notifications** to the manager. | ✅ built (Inbox + push) | Section 2, *Messages the manager receives*, and [`notifications.md`](notifications.md) for the deadline and approvals-waiting messages. |

Not a gap (do not build): chemist orders approval (info-only, decision 2026-10-12), manager approval of Admin-owned things, any second manager stage. Monthly Plans, Daily Plans and Services need one approval, the manager's or Admin's (2026-10-23); Leave is still manager, then HR or Admin.

## 5. What the phone team shows (their screens, our routes)

Suggested shape, not ours to build. Visible only when `GET /auth/me` shows the person has a downline (`their `use-is-manager` already decides this).

1. **Today (home):** summary tiles (Pending approvals, Not started, On leave, Blocked) and a person list sorted by what needs attention first. Pull to refresh. (T2, T3)
2. **Approvals:** tabs *Waiting for me* (`/approvals/inbox`) and *Team history* (`/approvals/team`). Filter by kind, person, overdue. Open a request for full detail (a DCR shows its calls, GPS result and flags; an expense month its lines; a plan its doctors). Approve, reject with a required reason, and **bulk approve** for plans and quiet DCRs. Overdue rows are marked. ✅ API, 📱
3. **People:** the roster (T1) with search; tapping opens the person page (T9): today, this month's figures, plans, DCRs, expenses, leave, doctors, targets.
4. **Reports:** *Team overview* (T5), *Sales dashboard* (✅ API, same figures as the web one), *Doctor visits / missed calls* (✅), *Orders* (T7), *Leave calendar* (T6). Month picker; the financial-year switch applies as elsewhere.
5. **Actions on a person:** unblock (reason), allow a late plan or expense submission (if the switch is on), set a target, set a doctor's visit target. All ✅ today; the phone just needs the buttons.

## 6. Rules for the manager's screens

- **Direct reports are acted on; everyone deeper is read-only** (PRD §7.1.3). The phone follows `canAct` and never guesses.
- **A manager sees nobody outside their downline.** The server enforces it (T10); a person from another team is `403`, not an empty list.
- **Managers also submit their own plans, DCR and expenses** to their own manager; keep *My work* and *Team* clearly separate.
- Every approve/reject/unblock/grant keeps the actor, time and reason on the record.
- All lists page and take the financial-year header like the existing reads; a past year is read-only.
- Money in paise on the wire; show rupees on the phone.

## 7. Build order (our side: API + docs)

1. ✅ **T10** access helper, **T1** roster, **T3** pending summary (built 2026-10-12).
2. ✅ **T2** Today, **T4** team plans, **T6** leave calendar: the daily-operations loop (built 2026-10-12).
3. ✅ **T5** team overview and **T9** person summary: the monitoring loop (built 2026-10-12).
4. ✅ **T7/T8** orders and stock/secondary status (built 2026-10-12).
5. Each route ships with tests (downline allowed, outsider refused, Admin allowed, moved-team month), OpenAPI entries, and updates to LLD, roadmap, decision-log and sign-off in the same step.
6. This note gets the final request/response shapes per route as each lands, so the phone team can build against it.

## 8. Questions for the client

**Answered 2026-10-12 (from the owner):**

- **Q1** How deep? **Whole team by default**; deeper levels are read-only, only direct reports can be acted on. (`scope` defaults to `all`; the phone may offer a switch to direct only.)
- **Q2** What counts as "not started"? **No calls or follow-ups logged by 11:00**, the system setting `TEAM_NOT_STARTED_AFTER` (Admin-editable).
- **Q3** Notifications (F8): **blocked and overdue always; new-request messages only for leave, monthly expenses and new doctors**; plans and daily reports stay with the badge. In-app Inbox only for now.
- **Q4** Salary or CTC for a manager? **No, never** (HR/Accounts only). Nothing in the Team routes returns pay.
- **Q5** Approve on behalf of an absent peer? **Admin only**, as today.
