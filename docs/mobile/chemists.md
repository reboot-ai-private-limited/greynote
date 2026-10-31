# Mobile — Adding Chemists

What the field app must do to add a chemist (pharmacy), and the rules the server enforces. The server is the authority. It works the same way as adding a doctor ([`doctors.md`](doctors.md) section 1), without the doctor-only fields. Added 2026-10-31 (see [decision log](../decision-log.md)).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against.

## 1. Adding a chemist

| # | Rule | Status |
|---|---|---|
| 1 | An employee adds a chemist **offline-first**: queue a `NEW_CHEMIST` sync record, or call `POST /field-master-data/chemists/added`. A **manager** (someone with a team) can only do this while Admin has *Managers can add chemists* on (default off, separate from *Managers can add doctors*): otherwise the API answers `403` and a queued `NEW_CHEMIST` record is refused with `MANAGER_NOT_ALLOWED`. Read `managerCanAddChemists` from `GET /config/public` and hide the button for managers when it is `false`. Send a `clientRequestId` (≥ 8 characters, one per add) so a retry never creates a second chemist. | ✅ |
| 2 | **Required:** `routeId` (one of the employee's own routes), `name` (max 150), `address` (max 500), `location` (the phone's GPS at the moment of adding: `{ latitude, longitude }`). Nothing else. | ✅ |
| 3 | **The chemist is `pending` until approved.** It can't be called on, ordered for, or counted for stock. It shows under "My added chemists" (`GET /field-master-data/chemists/added`) with its `approval` status. | ✅ |
| 4 | **Approval: the employee's manager or Admin — either one decides.** On approval the chemist becomes `active` and appears in the snapshot's `chemists` for everyone on that route. | ✅ |
| 5 | The approver can see the phone's location on a map. Admin may correct the registered location later; the server keeps the phone's as `capturedLocation`. | ✅ |
| 6 | A rejected, withdrawn or reopened chemist can be corrected and resubmitted: `PUT /field-master-data/chemists/added/:id` with the same fields (no `clientRequestId`). A waiting or approved one can't be edited by the employee (`409`). | ✅ |
| 7 | **Admin-added chemists** need no approval and appear in the snapshot once active. The phone does nothing different for them. | ✅ |

Errors worth a message: `400` on `routeId` — "That route isn't one of yours."; `403` — "Managers can't add chemists. Ask Admin."

## 2. Queued record (`NEW_CHEMIST`)

Payload: `{ routeId, name, address, location }`. The sync `clientId` is the `clientRequestId`. Refusals: `INVALID_PAYLOAD` (fix the field named), `ROUTE_NOT_ASSIGNED` (the route was taken away; pick another), `ADDED_AT_THE_SAME_TIME` (tap Submit again), `MANAGER_NOT_ALLOWED` (see rule 1).

## 3. Endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `GET /config/public` | Anyone signed in | `managerCanAddChemists`, `managerCanAddDoctors` |
| `GET /field-master-data/chemists/added` | Employee | Chemists I added, with approval status |
| `POST /field-master-data/chemists/added` | Employee; manager only if *Managers can add chemists* is on | Add a chemist (offline-first); `201`, or `200` for a retry |
| `PUT /field-master-data/chemists/added/:id` | Employee | Correct and resubmit a rejected, withdrawn or reopened chemist |
| `POST /approvals/:id/approve` and `/reject` | Manager, Admin | Decide a new-chemist request (kind `NEW_CHEMIST`) |
