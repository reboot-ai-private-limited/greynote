# Mobile — Service requests

What the field app does for a doctor's **service request**: the MR asks for a tour package, gift, online promotion or something else for a doctor, it is approved, and Admin marks it done (Accounts can only see the status). The phone shows the journey; the server owns every transition. Design: [`LLD/field-activity.md`](../LLD/field-activity.md), [`decision-log.md`](../decision-log.md). Related: [`visuals-gifts-services.md`](visuals-gifts-services.md) (§3 is the short version), [`doctors.md`](doctors.md), [`financial-year.md`](financial-year.md).

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the Services list, request form, detail with the approval trail, and the Waiting, Approved and Done journey.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | The MR **requests** a service for one of their doctors through the sync queue (`DOCTOR_SERVICE` record): `type` (tour package, gift, online promotion, others), `amountPaise`, `remarks`. It can be made offline. | ✅ |
| 2 | It goes **Employee → Manager** for approval, and **one approval is enough (2026-10-23)**: the manager or Admin, whoever acts first (no second Admin step; old requests waiting for Admin were set to approved). Admin still marks it done afterwards (rule 3). An Admin-recorded service (web) is approved at once. | ✅ |
| 3 | Once approved, **Admin marks it done** on the web (Accounts reads the list and status only). `409` if it is not approved yet or already done. The MR never marks it done. | ✅ |
| 4 | The list returns `status`, `awaitingDone` and `doneAt`. The journey to show: *Waiting for approval → Approved, to do → Done* (or *Rejected*). | ✅ |
| 5 | The list follows the financial year in view; in a past year it is read-only. | ✅ |

## 2. What the phone should show

- A "Services" list per doctor and an "All my requests" list, newest first, each with a status chip, the type, the amount and the date.
- A detail screen with the approval trail and, when done, who marked it and when.
- A new-request form: type, amount (₹), remarks; a doctor must be chosen first.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/field-activity/doctor-services` | Own requests (the signed-in MR's); pass `doctorId` for one doctor; `userId` defaults to the caller. Status is on each row. |
| `GET` | `/field-activity/doctor-services/:id` | One request with its approval trail. |
| sync | `DOCTOR_SERVICE` | Create the request (see [`dcr.md`](dcr.md) for the push). |
| `POST` | `/approvals/:id/withdraw` | Withdraw before final approval. |

Admin only (web, not the phone): `POST /field-activity/doctor-services/:id/done`, `POST /field-activity/admin/doctor-services`.
