# Mobile — Adding Doctors and Missed Calls

What the field app must do to add a doctor and to show the month's missed calls, and the rules the server enforces. The server is the authority. Companion to [`dailyplan.md`](dailyplan.md) and [`dcr.md`](dcr.md).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against. Changed 2026-10-12 (see [decision log](../decision-log.md)).

## 1. Adding a doctor

| # | Rule | Status |
|---|---|---|
| 1 | An employee adds a doctor **offline-first**: queue a `NEW_DOCTOR` sync record, or call `POST /field-master-data/doctors/added`. Send a `clientRequestId` (≥ 8 characters, one per add) so a retry never creates a second doctor. | ✅ |
| 2 | **Required:** `routeId` (one of the employee's own routes), `name`, `address`, `specialty` (must be on the speciality list in the snapshot's `specialties`), `qualification`, `location` (the phone's GPS at the moment of adding). | ✅ |
| 3 | **Optional:** `email`, **`clinicName`** (max 150), **`phone`** (10–15 digits, optional leading `+`), `dateOfBirth`, `anniversary` (`YYYY-MM-DD`, not in the future), `visitFrequency`. Send `null` or leave out for none. | ✅ new: `clinicName`, `phone` |
| 4 | **`visitFrequency` is 1–5** visits a month (was 1–6). Offer 1, 2, 3, 4, 5 and "No target". Empty = no target, so no missed-call tracking for that doctor. | ✅ |
| 5 | **The doctor is `pending` until approved.** It can't be called on, planned, or given samples. It shows under "My added doctors" (`GET /field-master-data/doctors/added`) with its `approval` status, and in the snapshot's `pendingDoctors`. | ✅ |
| 6 | **Approval: the employee's manager or Admin — either one decides.** There is no second stage. On approval the doctor becomes active and, with `AUTO_ASSIGN_DOCTOR_ON_APPROVAL` on, is assigned to the employee who added it. | ✅ changed |
| 7 | **The approver may edit before deciding:** any detail and the **location** (`PATCH /field-master-data/doctors/:id/review`, pending only). The location the doctor ends up with can differ from the phone's point (the server keeps the phone's as `capturedLocation`). After approval, show the approved values. | ✅ new |
| 8 | A rejected, withdrawn or reopened doctor can be corrected and resubmitted: `PUT /field-master-data/doctors/added/:id` with the same fields (no `clientRequestId`). A waiting or approved one can't be edited by the employee. | ✅ |
| 9 | **Admin-added doctors** need no approval; they appear in the snapshot once assigned to the employee. The phone does nothing different for them. | ✅ |

Errors worth a message: `400` on `routeId` — "That route isn't one of yours."; `400`/`422` on `specialty` — pick from the list; `phone` — "Enter a phone number of 10 to 15 digits."

## 2. What the snapshot carries

Each entry of `doctors` (active, assigned to me) now also has `clinicName` and `phone` (both `null` when not set), next to `email`, `dateOfBirth`, `anniversary` and `visitFrequency`. `pendingDoctors` is unchanged. Show clinic name and phone on the doctor card; the phone number may be tappable to call.

## 3. Missed calls (current month)

`GET /reports/doctor-visits?month=YYYY-MM&userId=<self>` — the employee reads only themself; a manager reads themself and their downline.

Per employee: `quota` (sum of frequencies), `made`, `missed`, `doctors`, `completedDoctors`. Per doctor row:

| Field | Use |
|---|---|
| `doctor` | name and speciality |
| `frequency` | "should visit" this month |
| `made` | calls on submitted or approved daily reports, never more than `frequency` |
| `missed` | "still to visit" = `frequency − made`, never below 0 |
| **`stage`** | **`COMPLETE`** (all visits made), **`IN_PROGRESS`** (some made), **`NOT_STARTED`** (none yet) — drive the badge and the sort |
| `plannedDays` | days this month the doctor was on an approved daily plan, up to yesterday |
| `missedSince` | the day the doctor was planned and then never called on or after (a missed call carried forward); `null` if none |

- Show the totals at the top ("**1 called, 3 missed**"), then the doctors, those with the most still to visit first (the server already orders them so).
- A doctor with no `visitFrequency` is not in the report.
- Doctors still owed visits are added to the next daily plan by the server as carried-over calls (see [`dailyplan.md`](dailyplan.md) rule 2); the phone does not add them itself.
- The month defaults to the current business month; let the employee move back to earlier months.

## 4. Endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `GET /field-master-data/doctors/mine` | Employee | Doctors assigned to me |
| `GET /field-master-data/doctors/added` | Employee | Doctors I added, with approval status |
| `POST /field-master-data/doctors/added` | Employee | Add a doctor (offline-first) |
| `PUT /field-master-data/doctors/added/:id` | Employee | Correct and resubmit a rejected, withdrawn or reopened doctor |
| `PATCH /field-master-data/doctors/:id/review` | Manager, Admin | Correct a pending doctor before approving |
| `PATCH /field-master-data/doctors/:id/targets` | Manager, Admin | Set visit frequency, date of birth, anniversary |
| `GET /reports/doctor-visits` | Employee, Manager, Admin | The month's quota, made, missed and stage |
| `POST /approvals/:id/approve` and `/reject` | Manager, Admin | Decide a new-doctor request |

## 5. What changed for the phone (2026-10-12)

1. Add **clinic name** and **phone** (both optional) to the add-doctor form, the offline queue payload and the doctor card.
2. Change the frequency picker to **1–5**.
3. Stop expecting a second (Admin) approval stage: a manager's approval makes the doctor active.
4. Show the new **stage** badge on the missed-calls screen.
