# Mobile — Daily report (calls, follow-ups, submit)

What the field app must do for the day's records and the final submit, and the rules the server enforces. The server is the authority; the phone's checks are only for a quick answer. Companion to [`dailyplan.md`](dailyplan.md) and [`monthlyplan.md`](monthlyplan.md). Design background: [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md) (2026-10-12, *Calls redesign*).

**Status key:** ✅ built on the server and web. The phone app is another team's; this is the contract it builds against.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the four records with the work type from the plan, no calls on Meeting, Conference or Strike days, the required note for the day on Meeting and Conference days, "Not in plan" flags, and removing a record before the final submit.

## 1. The four records

| | Doctor call | Doctor follow-up | Chemist call | Chemist follow-up |
|---|---|---|---|---|
| Sync kind | `DOCTOR_CALL` | `DOCTOR_FOLLOWUP` | `CHEMIST_CALL` | `CHEMIST_FOLLOWUP` |
| The phone sends | `reportDate`, `doctorId`, `samples`, `remarks`, `workWith`, `capturedLocation`, `accuracyMeters` | `reportDate`, `doctorId`, `remarks` (required), `capturedLocation`, `accuracyMeters` | `reportDate`, `chemistId`, `remarks`, `workWith`, `capturedLocation`, `accuracyMeters` | `reportDate`, `chemistId`, `remarks` (required), `capturedLocation`, `accuracyMeters` |
| Work type | **not sent** — the server stamps the day's plan type (`FIELD_WORK` or `DOCTOR_CAMPAIGN`) | same | same (the work type is gone from the chemist call) | same |
| Route type | stamped: the doctor's route and its type (`HQ`, `EX_STATION`, `OUT_STATION`) | same | same (the chemist's route) | same |
| Location | required, must be inside the radius | same | same | same |
| Plan flags | `notInPlan` (doctor not on the day's list), `routeNotInPlan` | `notInPlan` | `routeNotInPlan` | `notInPlan` (route not on the day's plan) |

Show the work type and route type on every record in the day's list ("Field work · Ex-station"); the sync result and the DCR pull carry them.

## 2. Rules

| # | Rule | Status |
|---|---|---|
| 1 | **Who can be picked.** A doctor is picked only if assigned to this employee (**one doctor = one employee**). A chemist is picked if it is on a route the employee has (**one chemist can be on many employees**, because routes can be shared). The sync snapshot already lists only these. | ✅ |
| 2 | **Location is required on all four records.** The server compares the phone's GPS (`capturedLocation`) with the registered location of the doctor or chemist. Inside `GEO_FENCE_RADIUS_METERS` (default **100 m**, from system config; read it from the config allow-list, never hard-code) the record is accepted. Anything else is **refused and nothing is stored** with `NOT_AT_LOCATION`; show the message as the error ("You are not at the doctor's location (240 m away, the limit is 100 m)"). | ✅ |
| 3 | `NOT_AT_LOCATION` also covers: no GPS reading, accuracy worse than `GEO_MAX_ACCURACY_METERS`, and a doctor/chemist with **no registered location** (tell the employee to ask Admin). The phone should pre-check with the cached location and block the Save button with the same message; the server's answer decides. A record refused this way is a rejected record, not a retry: drop it and let the employee go to the place and add it again. | ✅ |
| 4 | **Not in the plan is a flag, not an error.** The record is saved and marked; the manager and the DCR report see it. Do not ask the employee for a reason. | ✅ |
| 5 | **Work type comes from the plan.** The work-type picker is gone from calls. A day is `FIELD_WORK` or `DOCTOR_CAMPAIGN` for calls to be possible; both need routes. A campaign day pays **DA at the highest route type, and no TA**. | ✅ |
| 6 | **Meeting, Conference and Strike days have no calls or follow-ups.** The server refuses them with `CALL_NOT_ALLOWED_FOR_WORK_TYPE`; hide the Add buttons on those days. | ✅ |
| 7 | **Every day still gets a daily report.** On a Meeting or Conference day the employee writes a **note for the day** (agenda, venue) and submits: the `DCR_SUBMIT` payload carries `remarks`, and without it the server refuses with `REMARKS_REQUIRED`. On a Strike day the note is optional and submit is one tap. Field and campaign days may also send a note. TA/DA after approval: Meeting/Conference = DA at the HQ rate; Strike = nothing. | ✅ |
| 8 | **Remove a record before the final submit.** `DELETE /api/field-activity/dcr/:dcrId/calls/:callId` (doctor or chemist call) and `DELETE /api/field-activity/dcr/:dcrId/followups/:followupId`. Online only. Show a **soft confirmation first** ("Remove this call? This cannot be undone.") and call the API only on Yes. A doctor call gives its samples back. After the report is submitted: `409`; the manager can send it back, then the employee can remove again. A record that never left the phone is simply deleted locally. | ✅ |
| 9 | A report cannot be submitted without proper locations: this holds by construction, because a record away from its place is never stored. The old "manager accepts a flagged call" step remains only for records saved before this change. | ✅ |
| 10 | The final submit is unchanged otherwise: last record of the push, online only, depends on all the others, and the order of gate checks is as in [`dailyplan.md`](dailyplan.md) rule 10. | ✅ |
| 11 | **Days between visits to a doctor (2026-10-22).** After a **doctor call or doctor follow-up** on day D, the same employee can't record another call or follow-up on **that doctor** until day D + `DOCTOR_VISIT_GAP_DAYS` (Admin setting, default **8**, 0–9; 0 = off): a visit on the 1st allows the next from the 9th, so 4 visits a month fit (the most a doctor's frequency allows). It counts both ways (an earlier day synced after a later one) and also the same day (a second call or a follow-up after a call). It is per employee: a manager's joint visit isn't held back by the MR's. Chemists are not affected. A removed record (rule 8) no longer counts. The server refuses at sync with `DOCTOR_VISIT_TOO_SOON` and `reason.details` = `{ lastVisit, nextAllowed, gapDays }` (dates `YYYY-MM-DD`); the message already says it ("You visited this doctor on 3 Oct. The next visit can be from 11 Oct (8 days apart)."). **Phone pre-check:** read `DOCTOR_VISIT_GAP_DAYS` from the snapshot's `config.settings`; from the employee's own records on the phone (synced and queued), grey out "Add call" / "Add follow-up" for a doctor visited fewer than that many days ago and show "Next visit from 11 Oct". The server's answer still counts (records from another phone, a removed record). | ✅ server; 📱 phone to add |

## 3. Payload reference

```json
// DOCTOR_CALL
{ "reportDate": "2026-10-12", "doctorId": "…", "workWith": [], "remarks": null,
  "capturedLocation": { "latitude": 26.7271, "longitude": 88.3953 }, "accuracyMeters": 12,
  "samples": [{ "productId": "…", "quantity": 2 }] }

// DOCTOR_FOLLOWUP / CHEMIST_FOLLOWUP
{ "reportDate": "2026-10-12", "doctorId": "…", "remarks": "Visit again on Friday",
  "capturedLocation": { "latitude": 26.7271, "longitude": 88.3953 }, "accuracyMeters": 12 }

// DCR_SUBMIT
{ "reportDate": "2026-10-12", "remarks": "Quarterly review, Siliguri office" }
```

`workingType` in a call payload is ignored if sent. The result `data` of a call or follow-up is `{ geofence: { status: "PASS", distanceMeters, reason: null } }`; it can only be `PASS`.

## 4. Refusal codes (new)

| Code | When |
|---|---|
| `NOT_AT_LOCATION` | outside the radius, no GPS, weak GPS, or no registered location (any of the four records) |
| `CALL_NOT_ALLOWED_FOR_WORK_TYPE` | the day is a Meeting, Conference or Strike |
| `REMARKS_REQUIRED` | `DCR_SUBMIT` on a Meeting or Conference day without a note |
| `DOCTOR_VISIT_TOO_SOON` | a doctor call or follow-up within `DOCTOR_VISIT_GAP_DAYS` of this employee's other visit to that doctor (rule 11); `reason.details`: `lastVisit`, `nextAllowed`, `gapDays` |

`ROUTE_NOT_IN_PLAN` is **no longer sent**: a call off the planned route or to a doctor off the list is saved and flagged. `DOCTOR_NOT_FOUND`, `DOCTOR_NOT_ASSIGNED`, `CHEMIST_NOT_FOUND`, `CHEMIST_ROUTE_NOT_ASSIGNED`, `SAMPLES_EXHAUSTED` and the gate codes are unchanged.
