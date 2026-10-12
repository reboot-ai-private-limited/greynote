# LLD — Team

A manager's view of their downline. **Owns one small collection** (the alert marks, below) and otherwise no data: it reads Identity, Territory, Planning, Field Activity, HR, Reports, Sales, Field Master Data (outlet names) and Config (the last for the business day and the not-started time). Plan and phone contract: [`../mobile/team.md`](../mobile/team.md). Decision: [`../decision-log.md`](../decision-log.md) (2026-10-12). Managers use the phone only; the web portal is not for them.

## Access rule

One rule, `resolveTeamScope` (`apps/api/src/shared/access/teamScope.ts`): a route reads either the whole downline of the caller, or one named `userId` who must be in it. A person outside the downline is `403 FORBIDDEN` ("That employee is not in your team."), never an empty list. Direct reports are depth 1 (the manager approves for them); deeper levels are read-only (PRD §7.1.3). Admin reads everything through the portal and does not use these routes.

## HTTP surface (`/api/team`, FIELD only)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/members` | The downline nearest first, then by name. Query: `scope` (`direct`, `indirect`, `all`; default `all`), `status` (`active` default, or `all`), `search` (name or employee code), `page`, `pageSize` (default 50, max 100). Row: `id`, `employeeCode`, `name`, `designation`, `status`, `depth`, `isManager`, `managerId`, `hq`, `zone`. A FIELD employee with no team gets an empty page. Not tied to a financial year (who is on the team today). |
| `GET` | `/members/:id/summary` | One person in one read: the roster row, today's row, and their Team Overview row for `month` (default this month; `null` if they are no longer an active field employee). The person must be in the downline (403 otherwise). The month figures come from Reports through its public contract (`readTeamOverview`). |
| `GET` | `/today` | Each active person's day: plan, report, leave, blocked, with a state and an `attention` flag; tiles count the whole level, rows are filtered (`state`, `attention`) and paged. `date` is today or earlier. States: `REPORTED`, `WORKING`, `NOT_YET`, `NOT_STARTED`, `MISSED`, `ON_LEAVE`, `OFF`. Computed live, a few reads per person, in chunks of 20 (a team of hundreds is fine; revisit if a manager's team grows past ~500). |
| `GET` | `/plans` | A day's Daily Plan (any day) and the month's Monthly Plan status per active person; filter `planStatus` (a status or `NONE`), with counts for everyone. |
| `GET` | `/orders` | The team's orders in a window of at most 93 days (newest first), outlet names, totals by status (Cancelled left out of the amount), `truncated` when one person has more than 500 in the window. Reads Sales per person (`listOrders`), so each person's orders are bounded. A manager only reads: chemist orders are information, distributor orders are marked by their MR. |
| `GET` | `/stock` | For a month: per active person the outlets with no stock count (Sales `listMissingStock(month, userIds)`) and the month's secondary status (`listSecondaryStatus`: `NOT_ENTERED`, `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, see `monthSecondaryStatus`). `waitingOnYou` = a direct report's `PENDING` month. Tiles count the whole level. |
| `GET` | `/leaves` | The team's live leaves touching a window of at most 93 days (waiting, manager-approved, approved). Backed by HR's `listLeavesForUsers` (leaves joined to their approval requests in one batch). |

The not-started time is the Config key `TEAM_NOT_STARTED_AFTER` (`FIELD_ACTIVITY`, TIME, default `11:00`); a database not re-seeded since it was added reads the default. Display only.

`/members`, `/today`, `/plans` and `/leaves` also take `userId` (one person; 403 outside the downline; shown whatever the level). All of it goes through `narrowToTeam`/`resolveTeamScope`.

Related, in Reports: `GET /reports/team/overview` ([`reports.md`](reports.md)). Related, in Approval: `GET /approvals/inbox/summary` ([`approval.md`](approval.md)).

## Alerts to the manager (2026-10-12)

`TeamAlerts` (`application/teamAlerts.ts`), run by the server every 5 minutes (`team-alerts` job) and, for blocks, straight after the missed-report job. Sends through Inbox's `notify()` (system sender, no push).

- **New request:** Approval's `listWaitingOnManagers()` (Stage-1 requests whose submitter has a manager) filtered to `LEAVE`, `EXPENSE_MONTH` and `NEW_DOCTOR` submitted in the last 24 hours. Plans, reports and the other kinds are left to the badge.
- **Overdue:** the same list, `overdue` (past `APPROVAL_SLA_DAYS`), any kind. A reminder only.
- **Blocked:** `notifyBlocked(blocked)` with the people the missed-report run has just blocked (an already-blocked person is never in that list, a dry run never calls it). Goes to the person's own manager.
- **Once only:** `claim()` on `team_alert_marks` (`key` unique: `new:<requestId>:<cycle>` or `overdue:<requestId>:<cycle>`; TTL 90 days) is an atomic upsert per key, so two servers racing announce a request once. Claimed before sending: if sending fails the alert is lost rather than repeated.
- **Shape:** one message per manager per kind of alert per run, with a line per person (8 shown, then "…and N more"); kind `UPDATE` (new, blocked) or `REMINDER` (overdue); kept 14 days.
- **Switch:** `TEAM_ALERTS_ENABLED` (APPROVAL, default on; a database not re-seeded reads on).

## Still to build

Push (the phone team) and notifying the employee of decisions (F8). Routes, with shapes, are kept in [`../mobile/team.md`](../mobile/team.md) §2.
