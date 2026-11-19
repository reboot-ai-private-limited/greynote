# Mobile — Visuals, gifts and services

What each role may do and what the phone must show. The server is the authority.

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - Visuals (the MR adds; Remove only when `canRemove`), Gifts (mark Done, works offline) and Services.

## 1. Visuals

| # | Rule | Status |
|---|---|---|
| 1 | Admin keeps the **library** of visuals (upload, edit, activate). An MR cannot upload. | ✅ |
| 2 | The **MR picks** library visuals for **one specific doctor** they are assigned to (`POST /api/marketing/doctors/:doctorId/visuals { visualIds }`). The MR can only add. | ✅ |
| 3 | **Only the doctor's own MR (and Admin, on the web) adds; a manager above the MR, or Admin, takes off (2026-11-19).** A manager, including one who holds the doctor themselves, cannot add: `POST …/visuals` is `403 ONLY_MR_ADDS`. Take off is `DELETE …/visuals/:visualId` (the MR gets `403`). `GET` returns `canAdd` and `canRemove` — show the tick boxes and Submit only when `canAdd`, Remove only when `canRemove`. A manager's phone shows the doctor's chosen visuals with Remove. Admin can do both on the web doctor page. | ✅ 📱 |

## 2. Gifts

Admin allocates a gift to a doctor (web). The doctor's assigned MR sees it in `GET /api/field-activity/doctor-gifts` and **marks it done** (sync kind `GIFT_DONE`, with the day's push). Nobody approves it. A gift already done returns the "already given" reason. ✅ — the phone only needs the list and the Done action.

**Gifts list (2026-11-18).** `GET /field-activity/doctor-gifts` returns pending **and** done gifts, newest first. A field manager adds `?scope=team` to also get the gifts of doctors held by anyone below them, each with `userId` and `userName` (the MR). The phone shows one list with a filter row (All, Not done, Done), a search, serial numbers and a total; a manager's rows read "(Own)" or the MR's name; **Mark done** only on your own, not-done gifts. The snapshot's `pendingGifts` stays as the offline stand-in.

## 3. Services

| # | Rule | Status |
|---|---|---|
| 1 | **Any employee requests** a service for a doctor in their scope (`DOCTOR_SERVICE` sync kind; 2026-11-02): an MR for their own doctors, a manager for their team's. Type (tour package, gift, online promotion, others), amount, remarks. See [`service-requests.md`](service-requests.md) rule 1; its doctor dropdown has a search box (§2 there). | ✅ |
| 2 | It goes to **the requester's own manager** (Admin when they have none) for approval (an Admin-recorded service is approved at once). | ✅ |
| 3 | Once approved, **Admin marks it done** (Accounts is read-only since 2026-10-13) (`POST /api/field-activity/doctor-services/:id/done`; web Doctor services page). `409` if it is not approved yet or already done. The list returns `status`, `awaitingDone`, `doneAt`. | ✅ |
| 5 | **Team list (2026-11-18).** `GET /field-activity/doctor-services?scope=team` (a field manager) returns the manager's own requests and everyone below them, each with `userId` and `userName`. The phone shows one list, newest first, filter row All / Waiting / Approved / Done / Rejected, search, "(Own)" or the MR's name on each row. | ✅ |
| 4 | The phone shows the service's journey: *Waiting for approval → Approved, to do → Done* (or *Rejected*). The MR never marks it done. | ✅ |

## 4. Refs

[`LLD/marketing.md`](../LLD/marketing.md), [`LLD/field-activity.md`](../LLD/field-activity.md), decision-log 2026-10-10 (visuals) and 2026-10-12.
