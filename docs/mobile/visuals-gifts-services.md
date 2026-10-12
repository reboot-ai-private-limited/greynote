# Mobile — Visuals, gifts and services

What each role may do and what the phone must show. The server is the authority.

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.

## 1. Visuals

| # | Rule | Status |
|---|---|---|
| 1 | Admin keeps the **library** of visuals (upload, edit, activate). An MR cannot upload. | ✅ |
| 2 | The **MR picks** library visuals for **one specific doctor** they are assigned to (`POST /api/marketing/doctors/:doctorId/visuals { visualIds }`). The MR can only add. | ✅ |
| 3 | A **manager above the MR, or Admin, can edit that doctor's list**: add (same call) and take off (`DELETE …/visuals/:visualId`). Both are refused for anyone else (the MR gets `403` on remove). `GET` returns `canRemove` — show the remove control only when it is true. Admin can also do it on the web doctor page. | ✅ 📱 |

## 2. Gifts

Admin allocates a gift to a doctor (web). The doctor's assigned MR sees it in `GET /api/field-activity/doctor-gifts` and **marks it done** (sync kind `GIFT_DONE`, with the day's push). Nobody approves it. A gift already done returns the "already given" reason. ✅ — the phone only needs the list and the Done action.

## 3. Services

| # | Rule | Status |
|---|---|---|
| 1 | The MR **requests** a service for a doctor (`DOCTOR_SERVICE` sync kind): type (tour package, gift, online promotion, others), amount, remarks. | ✅ |
| 2 | It goes **Employee → Manager → Admin** for approval (an Admin-recorded service is approved at once). | ✅ |
| 3 | Once approved, **Admin or Accounts marks it done** (`POST /api/field-activity/doctor-services/:id/done`; web Doctor services page). `409` if it is not approved yet or already done. The list returns `status`, `awaitingDone`, `doneAt`. | ✅ |
| 4 | The phone shows the service's journey: *Waiting for approval → Approved, to do → Done* (or *Rejected*). The MR never marks it done. | 📱 |

## 4. Refs

[`LLD/marketing.md`](../LLD/marketing.md), [`LLD/field-activity.md`](../LLD/field-activity.md), decision-log 2026-10-10 (visuals) and 2026-10-12.
