# Mobile — What a manager sees of the team (doctors, chemists, distributors, territory)

**Server built 2026-11-16 (API and web). The phone is not changed yet: this is what the field app team builds against.** Decision: [`decision-log.md`](../decision-log.md), 2026-11-16.

## 1. The rule: computed, never copied

A manager does **not** get doctors, chemists, distributors or routes assigned to them. They see the **union of what the people in their team hold**, worked out when they ask.

- *Team* = the manager plus everyone below them at any depth (one `managerId` link per person; the server walks it).
- An MR leaves, or moves to another manager: their items leave (or move with them) at the next read. Nothing is cleaned up, so nothing goes stale.
- An item two MRs both hold stays visible until **both** let go.
- An item **nobody** holds is not in a team list. Admin sees it in the web "unassigned" views.

Who holds what (admin, web):

| Item | Holders | Visible to an MR by |
|---|---|---|
| Doctor | exactly **one** MR | `DoctorAssignment` (and, while `DOCTOR_VISIBILITY_FOLLOWS_ROUTE` is on, the route) |
| Chemist | **many** MRs (new 2026-11-16) | `ChemistAssignment` — **the route no longer decides** |
| Distributor | many MRs | `assignedUserIds` (since 2026-11-04) |

## 2. Endpoints for managers (field role only)

All paged: `page` (1…), `pageSize` (≤ 100, use 20). Reply is `{ items, page, pageSize, total, totalPages }`. A `userId` outside your team is **`403`**, never an empty list. Everyone else (not a field employee) gets `403`.

| Method and path | Query | Each item |
|---|---|---|
| `GET /field-master-data/doctors/team` | `search` (doctor name, or the MR's name or code), `routeId`, `userId` | the doctor, `assignedTo {userId,name,employeeCode}`, `assignedUserId`, **`routeNotHeld`** |
| `GET /field-master-data/chemists/team` | `search` (chemist name, or an MR's name or code), `routeId`, `userId` | the chemist and **`assignedTo[]`** — every MR *in your team* who holds it |
| `GET /field-master-data/distributors/team` | `search` (name, GST, contact), `userId` | the distributor and `assignedTo[]` — team members only; assignees outside your team are never shown |
| `GET /territory/team` | — | `{ zones: [{ id, name, hqs: [{ id, name, members, owned }] }] }` |
| `GET /territory/team/hqs/:hqId/routes` | `page`, `pageSize`, `search` | the HQ's **active** routes; an HQ outside your territory is `403` |

### Doctors

- **`routeNotHeld: true`** — the MR holding the doctor no longer has the doctor's route. The doctor is **still listed** (before 2026-11-16 it vanished from the manager's list); show a small "route not held" badge. The MR's own list (`/doctors/mine`) still hides it. Detail (`GET /doctors/:id`) now opens for the manager too.
- Visuals use the same rule as the list: a manager who can see the doctor can open and manage its visuals.
- The phone's snapshot `doctors` is **still the caller's own**. Do not put team doctors in the offline cache: show **My doctors** (offline, as today) and a **Team doctors** tab that calls `GET /doctors/team` online, 20 a page, with the search box.
- Not built yet: filters by HQ and status, and "unassigned" rows (see §6).

### Chemists

- Both **My chemists** (snapshot `chemists`, offline) and **Team chemists** (`/chemists/team`, online) as above.
- **The snapshot's `chemists` is now "the ones assigned to me", not "on my routes".** Same shape. Code that filtered chemists by route itself should stop: the list is already the right one. A chemist on a route you hold but not assigned to is **not** sent.
- A chemist an MR adds from the phone is assigned to that MR when the manager or Admin approves it (nothing for the phone to do).
- Calls, follow-ups and orders for a chemist are checked against the assignment. The refusal `CHEMIST_ROUTE_NOT_ASSIGNED` keeps its **old name** (phones in the field already handle it) but now means "you are no longer assigned to this chemist". Treat it like `DOCTOR_NOT_ASSIGNED`: drop the record, show the message.

### Territory (manager's Team → Territory screen)

- **Zones and HQs** come from people: an HQ shows when someone in your team has it as their main HQ (`members` = how many), or when you **own** it (`owned: true`): named in your coverage, or — for a ZSM — inside a Zone you own, or — for the NSM with no Zones named — any Zone.
- **Routes are not in that reply.** Tap an HQ → `GET /territory/team/hqs/:hqId/routes` with a type-ahead `search`. Use the same call for any **route picker** a manager gets (e.g. when a manager's doctor plan is switched on): choose the HQ first, then search routes inside it. Never load every route.
- `routes` in the phone's territory snapshot is still the caller's **own** assigned routes. A manager does not receive team routes there any more than they receive team doctors.
- Routes are **no longer copied onto managers**. Picking a manager no longer adds the employee's routes to the manager; the HQs and Zones still extend their coverage.

## 2a. Planning routes: route first (2026-11-17)

Routes belong to MRs, so a manager plans **the routes held by anyone below them** (any depth), plus their own. Nothing is copied onto the manager.

| Method and path | Who | What |
|---|---|---|
| `GET /planning/team-routes?hqId&search&page&pageSize` | Manager (`403` for an MR) | Tour Plan route picker: the routes held by the team, paged; reply `{ items:[{id,name,routeType,hqId,hqName,holders:[{id,name,label}],doctorCount}], page, pageSize, total, totalPages, hqs:[{id,name,routes}] }`. Start from `hqs`, then pick an HQ and search inside it. |
| `GET /planning/daily/route-options?date&routeIds=a,b` | Manager | Daily Plan: for the chosen routes, `people` (who to work with, routes in brackets) and `doctors`. |

- **Tour Plan:** working type, routes, remarks. **No Work With.** The server refuses a manager's route that nobody below them holds (`400`).
- **Daily Plan (manager):** choose the route(s) among the approved ones, then Works with and Doctors list only what is on those routes. Nobody or nothing on the route: tell the manager to ask their manager or Admin to change the plan. See [`dailyplan.md`](dailyplan.md) §1b.

## 3. Logging a call on a team doctor

A manager may call on any doctor assigned to anyone in their team, on any route (unchanged, 2026-11-03). The server checks this **when the call syncs**, per record, so a call logged offline against a doctor reassigned in the meantime is refused alone (`DOCTOR_NOT_ASSIGNED`) while the rest of the day syncs.

- Daily-report **submit does not re-check** doctors: a visit that happened stays valid even if the doctor is reassigned afterwards.
- The reviewing manager still approves or rejects the day; that is the backstop for anything odd.
- The check cost does not depend on team size (it walks up from the one assigned MR), so a ZSM logging a call is as cheap as an ASM.

## 4. Screens the phone should have

| Screen | Data |
|---|---|
| Doctors → **My** / **Team** (managers) | snapshot / `GET /doctors/team` |
| Chemists → **My** / **Team** (managers) | snapshot / `GET /chemists/team` |
| Distributors → **Team** (managers) | `GET /distributors/team`; the MR's own list is the snapshot, as today |
| Team → **Territory** (managers) | `GET /territory/team`, then `…/hqs/:hqId/routes` |

Show the MR's name on every team row (`assignedTo`). When several hold it, show "Asha +1".

## 5. Edge cases (each is covered by a server test)

| Case | Result |
|---|---|
| MR A and MR B under one manager; A leaves | B's items stay; items only A held drop out |
| Doctor's MR loses its route | Still in the manager's list, `routeNotHeld: true` |
| Employee moves to another manager | The old manager stops seeing their items, the new one starts, on the next read |
| Manager outside the team asked for | `403` |
| Doctor logged by a ZSM, doctor held by an MR three levels down | allowed |
| Doctor held by nobody | refused (`DOCTOR_NOT_ASSIGNED`), for managers too |

## 6. Not built yet (server side, planned)

- Doctors team list: filters by HQ and status, and rows for **unassigned** doctors on routes in the manager's territory (needs the territory scope above).
- Warn on adding a **duplicate doctor** (same name, route and phone), and a merge by the manager.
- The team's downline id list is read on every request. If teams pass ~500, a stored chain of managers per person will replace it (user rows only, rebuilt when a manager changes).

## 7. For the data

Two one-off scripts, run by hand (dry run by default; `--apply --confirm-db=<name>`):

- `backfill:chemist-assignments` — **before** deploying: assigns every active chemist to the field employees who hold its route today, so no MR loses a chemist when the rule changes.
- `cleanup:manager-routes` — **after**: ends the route rows that were copied onto managers.
