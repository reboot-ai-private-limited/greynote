# Mobile — Adding Doctors and Missed Calls

What the field app must do to add a doctor and to show the month's missed calls, and the rules the server enforces. The server is the authority. Companion to [`dailyplan.md`](dailyplan.md) and [`dcr.md`](dcr.md).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against. Changed 2026-10-12 (see [decision log](../decision-log.md)).
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** section 1 rules 1-6 and 8, the clinic name and phone, the 1-5 frequency picker, the Missed Calls stage badge and the tappable phone number were already in the app. **Now built:** rule 7 - the approver can correct a pending doctor (any detail and the location) before deciding, from the request ("Correct details or location", `PATCH /field-master-data/doctors/:id/review`; the route cannot be changed because no endpoint lists another employee routes); and a manager can set a doctors visit frequency, date of birth and anniversary (Team -> Visit targets, `PATCH /field-master-data/doctors/:id/targets`).

## 1. Adding a doctor

| # | Rule | Status |
|---|---|---|
| 1 | An employee adds a doctor **offline-first**: queue a `NEW_DOCTOR` sync record, or call `POST /field-master-data/doctors/added`. Send a `clientRequestId` (≥ 8 characters, one per add) so a retry never creates a second doctor. | ✅ |
| 2 | **Required:** `routeId` (one of the employee's own routes), `name`, `address`, `specialty` (must be on the speciality list in the snapshot's `specialties`), `qualification`, `location` (the phone's GPS at the moment of adding). | ✅ |
| 3 | **Optional:** `email`, **`clinicName`** (max 150), **`phone`** (10–15 digits, optional leading `+`), `dateOfBirth`, `anniversary` (`YYYY-MM-DD`, not in the future), `visitFrequency`. Send `null` or leave out for none. | ✅ new: `clinicName`, `phone` |
| 4 | **`visitFrequency` is 1–4** visits a month (2026-10-22; was 1–5, before that 1–6). Offer 1, 2, 3, 4 and "No target"; 5 or more is refused with `400` on `visitFrequency`. Empty = no target, so no missed-call tracking for that doctor. Four is the most that fits with the days between visits ([`dcr.md`](dcr.md) rule 11). | ✅ changed |
| 5 | **The doctor is `pending` until approved.** It can't be called on, planned, or given samples. It shows under "My added doctors" (`GET /field-master-data/doctors/added`) with its `approval` status, and in the snapshot's `pendingDoctors`. | ✅ |
| 6 | **Approval: the employee's manager or Admin — either one decides.** There is no second stage. On approval the doctor becomes active and, with `AUTO_ASSIGN_DOCTOR_ON_APPROVAL` on, is assigned to the employee who added it. | ✅ changed |
| 7 | **The approver may edit before deciding:** any detail and the **location** (`PATCH /field-master-data/doctors/:id/review`, pending only). The location the doctor ends up with can differ from the phone's point (the server keeps the phone's as `capturedLocation`). After approval, show the approved values. | ✅ new |
| 8 | A rejected, withdrawn or reopened doctor can be corrected and resubmitted: `PUT /field-master-data/doctors/added/:id` with the same fields (no `clientRequestId`). A waiting or approved one can't be edited by the employee. | ✅ |
| 9 | **Admin-added doctors** need no approval; they appear in the snapshot once assigned to the employee. The phone does nothing different for them. | ✅ |
| 10 | **Optional photo (2026-10-23).** The photo is **not** part of the add: the add stays JSON, so it works offline. Once the doctor exists on the server (its create has synced and you know its `id`), upload it with `PUT /field-master-data/doctors/added/:id/photo` (`multipart/form-data`, one field `file`; JPG, PNG or WebP, up to 5 MB; checked by the file's first bytes). It replaces any earlier photo; `DELETE` on the same path removes it. Both answer `{ photoUrl }` (`null` after a delete). Allowed only for the employee who added the doctor, **while it is waiting or sent back; once approved it is `409` and only Admin changes it** (web). Changing the photo does **not** resubmit the request. A photo that fails to upload never blocks the doctor or its approval: keep the file queued and retry; a retry is safe (it just replaces). `400` on `file` for a wrong type, an empty file or over 5 MB. Choosing a photo is optional; send nothing for none. | ✅ API (phone work not started) |

Errors worth a message: `400` on `routeId` — "That route isn't one of yours."; `400`/`422` on `specialty` — pick from the list; `phone` — "Enter a phone number of 10 to 15 digits."

## 2. What the snapshot carries

Each entry of `doctors` and of `pendingDoctors` also has **`photoUrl`** (2026-10-23): the address of the doctor's photo, or `null` (every doctor added before photos existed, and any without one). Show it in a circle on the doctor card and list, and the doctor's **initials** when `null`. The storage id is never sent. Because the snapshot is compared by hash, the first sync after this ships re-downloads once. Older app builds ignore the new field.

Each entry of `doctors` (active, assigned to me) now also has `clinicName` and `phone` (both `null` when not set), next to `email`, `dateOfBirth`, `anniversary` and `visitFrequency`. `pendingDoctors` is unchanged. Show clinic name and phone on the doctor card; the phone number may be tappable to call.

## 2a. When Admin deactivates, deletes or moves a doctor (2026-10-22)

Admin does this on the web only; the phone never edits, deactivates or deletes a doctor (an employee still corrects only their own rejected added doctor, rule 8). What the phone sees:

| # | What happens | What the phone should do | Status |
|---|---|---|---|
| D1 | **Deactivated, deleted, unassigned from me, or given to another MR:** the doctor drops out of `GET /doctors/mine` and the snapshot's `doctors` at the next sync. | Remove it from the doctor list and pickers after the next sync; don't keep it from an old cache. | ✅ |
| D2 | **My Daily Plans from today that I can still change** (draft, rejected, withdrawn, reopened) **lose the doctor**; the server takes it off. Submitted or approved plans keep it. | Re-read the plan after a sync; don't re-send a doctor list containing it (a save or submit with it is refused: `400` on `doctorIds`). | ✅ |
| D3 | **A call on it is refused**, also one recorded offline and pushed later: the record comes back refused with the existing `doctorNotFound` reason ("This doctor isn't on the list any more"). The same for a gift, a service or a sample on it. | Show the reason on the queued record; the employee discards it. | ✅ (existing behaviour) |
| D4 | **History keeps the name.** Past calls, DCRs, gifts, services and reports still show the doctor's name, even after a delete. | Nothing to do; never hide a past record because its doctor is gone. | ✅ |
| D5 | A doctor **reactivated** by Admin comes back only once Admin assigns it to an MR again. | Nothing to do. | ✅ |

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
| `PUT /field-master-data/doctors/added/:id/photo` | Employee | Set or replace the photo of a doctor I added (multipart `file`), until it is approved |
| `DELETE /field-master-data/doctors/added/:id/photo` | Employee | Remove that photo |
| `PATCH /field-master-data/doctors/:id/review` | Manager, Admin | Correct a pending doctor before approving |
| `PATCH /field-master-data/doctors/:id/targets` | Manager, Admin | Set visit frequency, date of birth, anniversary |
| `GET /reports/doctor-visits` | Employee, Manager, Admin | The month's quota, made, missed and stage |
| `POST /approvals/:id/approve` and `/reject` | Manager, Admin | Decide a new-doctor request |

## 5. What changed for the phone (2026-10-12)

1. Add **clinic name** and **phone** (both optional) to the add-doctor form, the offline queue payload and the doctor card.
2. Change the frequency picker to **1–4** (2026-10-22; it was 1–5).
3. Stop expecting a second (Admin) approval stage: a manager's approval makes the doctor active.
4. Show the new **stage** badge on the missed-calls screen.

## 6. What changed for the phone (2026-10-23): optional doctor photo

1. Read **`photoUrl`** on each doctor in the snapshot's `doctors` and `pendingDoctors` and show it, with initials as the fallback. It is `null` for all existing doctors; nothing breaks if you ignore it.
2. In the add-doctor form, an optional **photo** (camera or gallery). Keep it with the queued add and upload it with `PUT /field-master-data/doctors/added/:id/photo` after the add syncs (rule 10). Don't block the add on it.
3. Until the doctor is approved the employee may replace or remove the photo; after approval only Admin can (web).
