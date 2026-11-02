# Mobile — Service requests

What the field app does for a doctor's **service request**: the MR asks for a tour package, gift, online promotion or something else for a doctor, it is approved, and Admin marks it done (Accounts can only see the status). The phone shows the journey; the server owns every transition. Design: [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md). Related: [`visuals-gifts-services.md`](visuals-gifts-services.md) (§3 is the short version), [`doctors.md`](doctors.md), [`financial-year.md`](financial-year.md).

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Changed 2026-11-02:** any employee can request a service, whatever their designation: an MR for their own doctors, a manager for the doctors of their team. Before, only the assigned MR could (rule 1). The server change is backward compatible; the phone needs to let a manager open the form (📱 rule 1).
**Added 2026-11-02:** the form's doctor dropdown needs a **search box** (§2). The server already supports it, so nothing changes on the API; this is phone work only (📱).
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the Services list, request form, detail with the approval trail, and the Waiting, Approved and Done journey.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Any employee requests** a service through the sync queue (`DOCTOR_SERVICE` record): `type` (tour package, gift, online promotion, others), `amountPaise`, `remarks`. It can be made offline. **Whose doctor:** an MR, one assigned to them; a manager (ASM, RSM, ZSM, NSM), one assigned to anyone in their team at any depth, or one of their own. Any other doctor is refused with `DOCTOR_NOT_ASSIGNED` ("This doctor is not yours or your team's…"). A doctor who is inactive or gone is `DOCTOR_NOT_FOUND`. A person blocked for missed reports still cannot request. | ✅ 📱 |
| 2 | It goes to **the requester's own manager** for approval (a manager's request goes to *their* manager; someone with no manager, such as the NSM, goes straight to Admin), and **one approval is enough (2026-10-23)**: the manager or Admin, whoever acts first (no second Admin step; old requests waiting for Admin were set to approved). Admin still marks it done afterwards (rule 3). An Admin-recorded service (web) is approved at once. | ✅ |
| 3 | Once approved, **Admin marks it done** on the web (Accounts reads the list and status only). `409` if it is not approved yet or already done. The MR never marks it done. | ✅ |
| 4 | The list returns `status`, `awaitingDone` and `doneAt`. The journey to show: *Waiting for approval → Approved, to do → Done* (or *Rejected*). | ✅ |
| 5 | The list follows the financial year in view; in a past year it is read-only. | ✅ |

## 2. What the phone should show

- A "Services" list per doctor and an "All my requests" list, newest first, each with a status chip, the type, the amount and the date.
- A detail screen with the approval trail and, when done, who marked it and when.
- A new-request form: type, amount (₹), remarks; a doctor must be chosen first, with the **searchable doctor picker** below.
- **Doctor picker (search) 📱.** A dropdown with a search box on top, so the employee types instead of scrolling a long list.
  - **Feed:** an MR uses `GET /field-master-data/doctors/mine`; a manager uses `GET /field-master-data/doctors/team` (the same list the Team tab shows: their team's doctors and their own). Do not offer other doctors. Do **not** use `GET /field-master-data/doctors`; it is Admin only (the web form uses it).
  - **Search:** send `search=<text>` (trimmed, 1-100 characters, not case-sensitive). On `mine` it matches the doctor's name. On `team` it matches the doctor's name **or** the name or employee code of the MR the doctor is assigned to ([`doctors.md`](doctors.md) "Search by MR name"). Label the box **"Doctor"** for an MR and **"Doctor or MR"** for a manager. Leave `search` out when the box is empty.
  - **Typing:** wait about 300 ms after the last key before calling, and ignore an older answer that arrives after a newer one.
  - **Paging:** `page` (from 1) and `pageSize` (default 20, at most 100); load the next page as the list scrolls. Only active doctors come back. `routeId` can narrow by route if the form has one.
  - **Rows:** show `name` and specialty. Keep the chosen doctor in the form's own state, so it stays selected when the search text changes. If nothing matches, show "No doctor matches".
  - **Offline:** with no connection, filter the doctors already cached on the phone by name. The request can still be queued; the server checks the doctor again at sync (`DOCTOR_NOT_ASSIGNED`, `DOCTOR_NOT_FOUND`).
- A service is tied to the person who asked: a manager sees their own requests in "All my requests", not their team's.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/field-activity/doctor-services` | Own requests (the signed-in employee's, manager or MR); pass `doctorId` for one doctor; `userId` defaults to the caller. Status is on each row. |
| `GET` | `/field-activity/doctor-services/:id` | One request with its approval trail. |
| `GET` | `/field-master-data/doctors/mine` | Doctor picker for an MR: `search` (doctor name), `page`, `pageSize` (≤ 100), `routeId`. Active doctors only. |
| `GET` | `/field-master-data/doctors/team` | Doctor picker for a manager: the same, plus optional `userId`; `search` also matches the assigned MR's name or code. |
| sync | `DOCTOR_SERVICE` | Create the request (see [`dcr.md`](dcr.md) for the push). |
| `POST` | `/approvals/:id/withdraw` | Withdraw before final approval. |

Admin only (web, not the phone): `POST /field-activity/doctor-services/:id/done`, `POST /field-activity/admin/doctor-services`.
