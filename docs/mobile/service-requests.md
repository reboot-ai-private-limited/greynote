# Mobile — Service requests

What the field app does for a doctor's **service request**: the MR asks for a tour package, gift, online promotion or something else for a doctor, it is approved, and Admin marks it done (Accounts can only see the status). The phone shows the journey; the server owns every transition. Design: [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md). Related: [`visuals-gifts-services.md`](visuals-gifts-services.md) (§3 is the short version), [`doctors.md`](doctors.md), [`financial-year.md`](financial-year.md).

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Changed 2026-11-02:** any employee can request a service, whatever their designation: an MR for their own doctors, a manager for the doctors of their team. Before, only the assigned MR could (rule 1). The server change is backward compatible; the phone needs to let a manager open the form (📱 rule 1).
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
- A new-request form: type, amount (₹), remarks; a doctor must be chosen first. For a manager the doctor picker lists the doctors of their team as well as their own (the same list the Team tab already shows); do not offer other doctors.
- A service is tied to the person who asked: a manager sees their own requests in "All my requests", not their team's.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/field-activity/doctor-services` | Own requests (the signed-in employee's, manager or MR); pass `doctorId` for one doctor; `userId` defaults to the caller. Status is on each row. |
| `GET` | `/field-activity/doctor-services/:id` | One request with its approval trail. |
| sync | `DOCTOR_SERVICE` | Create the request (see [`dcr.md`](dcr.md) for the push). |
| `POST` | `/approvals/:id/withdraw` | Withdraw before final approval. |

Admin only (web, not the phone): `POST /field-activity/doctor-services/:id/done`, `POST /field-activity/admin/doctor-services`.
