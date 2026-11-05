# Mobile — Secondary sales and targets

How an employee's monthly **secondary** is entered and approved, and how **targets** and **achievement** relate to it. Online only. Decision: decision-log 2026-10-12.

**Changed 2026-11-02:** after the stock deadline an employee given a secondary exception (web) can still enter figures and files. Still `MONTH_CLOSED` for everyone else. No phone change needed. See [`../LLD/lateGrants.md`](../LLD/lateGrants.md).

**Changed 2026-11-03:** (1) **Admin can delete a month's secondary:** `DELETE /api/sales/employee-secondary?userId=&month=` (Admin only, `403 ADMIN_ONLY` otherwise) removes every line's units, amount and status, the month's files (and the stored copies) and its approval request; Admin's primary change on a line stays. No deadline for Admin; `MONTH_NOT_STARTED` / closed financial year still apply. An empty month is not an error. The phone does not offer this (Admin works on the web). (2) **A manager can edit a team member's month** with the existing `POST /employee-secondary` and the attachment calls (`userId` for someone else's month): the phone has an **Edit figures** button on the approval card and under Team > Stock & secondary. Only the lines the manager changes become `APPROVED`; lines left alone stay `PENDING` and the request stays open until it is decided.

## Secondary sales screen, per MR and distributor (2026-11-05) — what the phone must build

**Supersedes** the 2026-11-04 section below for MRs. Same screen name, new contents. The field app is another team's, so this is the contract; the server and web are built.

**Who:** only an **MR** (a field employee with nobody below them) enters. A manager never enters: they get the manager view below. `403 MR_ONLY` otherwise.

**Everything is in units.** Nobody types an amount. Amounts are shown, computed as `units × ptsPaise`.

### MR screen

One row per distributor assigned to the MR and product. Each row holds **four numbers**: **Opening**, **Primary** (received), **Secondary** (issued) and **Closing**. Closing is shown, never typed: `closing = opening + primary − issued`.

| # | Rule |
|---|---|
| 1 | **Read:** `GET /api/sales/secondary-stock?userId=<you>&month=YYYY-MM` returns every assigned distributor × every active product: `openingQty`, `primaryQty`, `issuedQty`, `closingQty`, `suggestedOpeningQty`, `suggestedPrimaryQty`, `openingEdited`, `primaryEdited`, `saved`, `ptsPaise`, `issuedAmountPaise`, `closingAmountPaise`, plus `totals` per distributor and for the month, and a `status` per distributor and month (`NOT_ENTERED`, `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`). Draw from this; do not compute opening or primary on the phone. |
| 2 | **Opening** defaults to the MR's **previous month's approved closing** for that distributor and product (0 if none), **not** from orders. The MR can edit it. An edited opening that differs from the default is flagged (`openingEdited`) to the manager. |
| 3 | **Primary** defaults to the MR's **own Done orders** to that distributor in the month. The MR can edit it to match what the distributor really received (`primaryEdited` flags a difference). |
| 4 | **Secondary (issued)** starts at 0 and is typed. |
| 5 | **Save draft:** `POST /api/sales/secondary-stock { month, lines: [{ distributorId, productId, openingQty, primaryQty, issuedQty }] }`. Whole units, 0 or more. Send only the rows the MR changed, or all of them. `400 INVALID_PAYLOAD` if issued is more than opening + primary: block it on the phone first. Saving again overwrites. |
| 6 | **Submit:** `POST /api/sales/secondary-stock/submit { month }`. Every draft or rejected row becomes `PENDING` and one approval request goes to the direct manager (Admin if none). `409 SECONDARY_NOTHING_TO_SEND` if there is nothing to send. |
| 7 | A `PENDING` or `APPROVED` month is locked (`409 SECONDARY_LOCKED`). It opens again after a rejection, a withdrawal, or when Admin reopens it. The usual month window applies (`MONTH_NOT_STARTED`, `MONTH_CLOSED`, closed financial year). |
| 8 | Only a distributor **assigned to the MR** (`403 OUTLET_NOT_YOURS`). |
| 9 | **Only `APPROVED` rows count** for achievement, targets and every report. |
| 10 | **A proof file is required to submit (2026-11-05).** `POST /api/sales/secondary-stock/submit` returns `409 ATTACHMENT_REQUIRED` while the month has no file. Upload with the existing `POST /api/sales/employee-secondary/attachments` (`multipart`: `file`, `month`; PDF/JPG/PNG up to 5 MB, any number, section 1b). `GET /api/sales/secondary-stock` now also returns `attachments[]` and `attachmentCount`; keep **Submit** disabled until `attachmentCount >= 1`. The files freeze with the month once it is `PENDING` or `APPROVED` (`409 SECONDARY_LOCKED` on add or remove) and open again after a rejection, withdrawal or reopen. |

**Attachment File button (phone).** Label it exactly **Attachment File** (not "Add files"), as a **primary, highlighted** button (the app's accent colour, with the paperclip), not a secondary one, because the secondary style was not noticed. Under it show the thumbnails, and while there are none show a warning-coloured line **"Required before submitting: attach at least one file."** Put it above the sticky Submit.

**Layout.** Phone: month picker, then a distributor list with a status chip, then one distributor at a time as a list of **compact product cards**: name on top, then three numeric steppers (Opening, Primary, Secondary) and a read-only Closing, with the value in rupees under the card (`= ₹ units × PTS`, updating as the MR types). Keep a **sticky footer** with the distributor's totals (units and ₹), **Save draft** and **Submit**. Tablet: two panes, distributors on the left and the product table on the right with all four columns and a totals row. Mark rows that differ from their defaults, and rows where closing would go below zero. Online only.

### Manager view

A manager opens the same screen and sees **no entry controls**. Read it from `GET /api/sales/secondary-report?month=YYYY-MM` (Admin may add `managerId`). It returns, per distributor, per product: `openingQty`, `primaryQty`, `issuedQty`, `closingQty`, `issuedAmountPaise`, `closingAmountPaise`, `byMr[]` (each MR's own figures), `totals` per distributor and for the month, and `mrCount` / `approvedMrCount`.

| # | Rule |
|---|---|
| 1 | The figures are the **approved** rows of the MRs in the manager's downline only. The manager's own figures are never added and a junior manager's total is never added on top of the same MRs, so a distributor's product is counted once: MR-A issued 2 + MR-B issued 4 = **6**, not 4 + 2 + 6. |
| 2 | Show distributor → product rows with the four numbers and ₹ value, then totals. **Tapping a row** shows the MRs behind it (`byMr`). |
| 3 | Show `approvedMrCount` of `mrCount` so a manager knows whose month is still draft or waiting. |
| 4 | Approving or rejecting stays on the Approvals screen (`STOCK_COUNT` request, record `userId:month`). |

**Achievement** now credits each approved row's issued units, at PTS, to the MR who entered it, and to nobody else. A distributor-month that has MR rows no longer counts by assignment. Months with no MR rows behave as before.

**The old "Distributor stock" counting tab and the "My record" tab are replaced** by this screen. `orders-and-stock.md` says the Monthly-stock tab is removed from the phone; that stays true, this is a different screen. The old `POST /sales/monthly-stock` (opening and closing counts) remains for older builds.

## Distributor stock counts with approval (2026-11-04) — superseded for MRs by the section above

**Two tabs on the Secondary Sales screen, and only the first one is entered:**

1. **Distributor stock** (the count, as today): pick a distributor *assigned to you*, enter opening and closing by product. Add **Save draft** and **Submit**, and a status chip per distributor and month.
2. **My record**: **read only**, no typing, no files, no approval. It shows your total secondary **per product** for the month: units and amount at PTS, summed over your distributors. Read it from `GET /api/reports/employee-sales?userId=<you>&from=<month>&to=<month>` (`products[].secondaryQty`, `secondaryPaise`), the same figures as your achievement. Remove the old per-product entry, Send for approval and Add files from this tab.

**Switch.** Everything below happens only when the Admin setting **`STOCK_COUNT_APPROVAL`** is on (default off). Off, a saved count counts at once, exactly as before, and the old per-product entry still works. Turn it on after the phone ships Save draft and Submit.

| # | Rule |
|---|---|
| 1 | With the switch on, `POST /sales/monthly-stock` (or the `MONTHLY_STOCK` sync record) for a **distributor** saves a **`DRAFT`** for an employee. Admin's count is `APPROVED` at once. Chemist counts are never held. |
| 2 | **Submit:** `POST /api/sales/stock-counts/submit { month }` (FIELD). Every `DRAFT` or `REJECTED` distributor count the employee recorded for the month becomes `PENDING` and one `STOCK_COUNT` approval request (record `userId:month`) goes to the direct manager, Admin if none. `409 SECONDARY_NOTHING_TO_SEND` when there is nothing to send. Online only. |
| 3 | A `PENDING` or `APPROVED` month is locked to the employee (`409 SECONDARY_LOCKED`). It opens again after a rejection, or when the request is withdrawn (Approvals, Withdraw) or Admin reopens it; the counts go back to `DRAFT`. |
| 4 | **Only `APPROVED` counts feed achievement, targets and every report.** Counts from before the switch have no status and read as approved. |
| 5 | On approval the employees it counts toward are fixed on the rows: the one who counted and everyone the distributor is assigned to at that moment. Unassigning someone later changes nothing in an approved month. |
| 6 | **Read:** `GET /api/sales/stock-counts?userId&month` returns the month by distributor with `status`, and per product `openingQty`, `closingQty`, `deliveredQty`, `secondaryQty` and `secondaryAmountPaise`. Self, the manager above, or Admin. Show the status chips from it. |
| 7 | **Admin delete:** `DELETE /api/sales/stock-counts?userId&month` removes the employee's counts for the month and the request, so they can count and submit again (late entry follows the usual exception). Admin only; the phone does not offer it. |
| 8 | Only a distributor **assigned to the employee** can be counted (`403 OUTLET_NOT_YOURS` otherwise); a distributor no longer shows by route coverage alone. |

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it.
**Added 2026-11-02:** a month's secondary can carry **files** (photos or PDFs), any number, as proof of the figures (section 1b). Optional, and backward compatible: an older phone build just never sends or shows them.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - Secondary Sales (units and amount, status per line and month, Send for approval, locked states) and read-only Targets with achievement; a manager can set and now **remove** a target.

## 1. Secondary (what the employee sold)

| # | Rule | Status |
|---|---|---|
| 1 | One figure per **product per month**: `GET /api/sales/employee-sales?userId=&month=` lists every active product with `secondaryQty`, `secondaryAmountPaise`, **`ptsPaise`** (and `ptrPaise`, for reference only) and `secondaryStatus`. | ✅ |
| 2 | **Units and amount are one figure at the product's PTS** (changed from PTR on 2026-10-14; use `ptsPaise`, not `ptrPaise`). Save with `POST /api/sales/employee-secondary` giving `qty` **or** `amountPaise` for each line; the server returns both. An amount is rounded to whole units and restated (units × PTS). A product with no PTS takes units only (`400 SECONDARY_NEEDS_PTR` for an amount). | ✅ |
| 3 | The employee's own entry is a **`DRAFT`**. They **send the month** with `POST /api/sales/employee-secondary/submit { month }`; every draft or rejected line becomes `PENDING` and a `SECONDARY_SALES` approval request goes to the **direct manager** (Admin may decide in their place). | ✅ |
| 4 | While `PENDING` or `APPROVED` the employee cannot change the month (`409 SECONDARY_LOCKED`). It opens again after a rejection, or when the request is withdrawn or Admin reopens it. A line a manager or Admin enters for the employee is `APPROVED` at once. | ✅ |
| 5 | **Only `APPROVED` secondary counts** toward achievement. Months entered before approval existed read as approved. | ✅ |
| 6 | Same window as before: the month must have started; after `MONTHLY_STOCK_DEADLINE_DAY` of the next month only Admin, a month Admin reopened, or an employee Admin (or their manager, where `LATE_STOCK_GRANT_BY_MANAGER` is on) has given a **secondary exception** for that month takes entries; that exception lasts until its end time, not used up. Still `MONTH_CLOSED` otherwise. | ✅ |

Show a status chip per line and for the month (`secondaryStatus`: Draft / Waiting for approval / Approved / Rejected), a **Send for approval** button when the month is a draft or rejected, and an amount field beside the units that fills the other as the user types (`amount = units × ptsPaise`).

## 1b. Files on the month (2026-11-02) 📱

An employee can attach **photos or PDFs** to a month's secondary, for example a picture of the distributor's sales statement. They belong to the employee and the month, not to a product line. **There is no limit on how many.** Attaching is **required** on the Secondary Sales screen of 2026-11-05 (`ATTACHMENT_REQUIRED` on submit; see its rule 10) and stays optional only for the retired per-product *Send for approval*.

| # | Rule | Status |
|---|---|---|
| 1 | **Add:** `POST /api/sales/employee-secondary/attachments`, `multipart/form-data` with `file` (one per call; send several files as several calls), `month` (`YYYY-MM`) and, only when working on someone else's month, `userId`. Returns the file: `{ id, url, fileName, mimeType, sizeBytes, uploadedBy, uploadedAt }`. | ✅ 📱 |
| 2 | **Type and size:** a **PDF, JPG or PNG** of at most **5 MB**. The server reads the type from the file's own bytes, so renaming a file does not get it through. `400` with `field: file` otherwise (`INVALID_PAYLOAD`). Compress or resize a photo on the phone before sending. | ✅ 📱 |
| 3 | **Read:** `GET /api/sales/employee-sales?userId=&month=` (the month's figures) now also returns **`attachments[]`** (oldest first, `[]` when none). Open `url` to view a file. | ✅ 📱 |
| 4 | **Remove:** `DELETE /api/sales/employee-secondary/attachments/:id`. The file is removed from storage too. `404 ATTACHMENT_NOT_FOUND` if it is gone already. | ✅ 📱 |
| 5 | **When:** the same rules as the figures. The employee can add and remove while the month is a `DRAFT` or `REJECTED`; once it is `PENDING` or `APPROVED` their own files are frozen (`409 SECONDARY_LOCKED`) until it is withdrawn, rejected or reopened. A manager (for their team) or Admin can add and remove at any status. The month must have started (`MONTH_NOT_STARTED`), and after `MONTHLY_STOCK_DEADLINE_DAY` of the next month only Admin, a reopened month, or an employee holding the secondary exception for that month can change files (`MONTH_CLOSED` otherwise). | ✅ 📱 |
| 6 | **Who sees them:** the employee, the manager above, and Admin; the approver sees them on the approval card on the web. | ✅ |

Phone screen: on the month's secondary screen show the thumbnails (a PDF as an icon), an **Attachment File** button (primary, highlighted) that lets the user pick several, and a remove button on each while rule 5 allows it. Upload them one after another and show each one's error (a file over 5 MB, a type that is not allowed) without stopping the rest. Offline is not supported (secondary is online only).

## 2. Targets

**Manager targets, 2026-10-14.** A manager (any designation above MR) has **no target of their own**: their target, achievement and primary are the **sum of every MR in their whole downline**, worked out when read (`GET /reports/employee-sales` for a manager returns the MRs' targets merged, one line per product and run of months, and `team: { mrCount }`; the Sales dashboard row carries `mrCount`). `POST /marketing/targets` for a manager is refused with `400` ("set the target on each MR"); `GET /marketing/targets/:userId` returns `[]` for a manager. A target a manager already has is ignored, not deleted (`report:manager-targets` lists them). The phone's manager targets screen should show the team total with a per-MR breakdown, hide **Set a target** for a manager row, and show "No MRs under you" when `mrCount` is 0. Since 2026-10-24 a manager no longer sets targets: `POST`, `PATCH` and `DELETE /marketing/targets` are Admin and HR only (`403` for a manager), so the phone must remove **Set a target**, Edit and Remove and keep the targets screen read-only. **Editing (2026-10-22):** `PATCH /marketing/targets/:id` with `{ month, toMonth?, productId, targetAmountPaise | targetQty }` changes that target in place (product, months, amount or units; not the employee); `409 TARGET_CLASH` means the MR already has a target with that product and months: show the message and offer to edit that one. The phone's target list can offer Edit beside Remove (docs only; the app is another team's).

- Set by Admin or HR; a manager reads their team's, an MR only their own. The phone shows them read-only.
- A target is **per product, for a run of months** of the current financial year, as an **amount or as units**: for a product with a PTS, one follows the other (`units × PTS = amount`) and both are returned (`targetQty`, `targetAmountPaise`). A target for **all products** is an amount only.
- **Achievement** = the employee's **approved** secondary for the product in those months, against the target — shown as amount % and, when the target has units, units %. It is computed when read, never stored.

## 2b. Per-distributor primary (2026-10-14)

The web employee report lists an employee's Done orders **by distributor** (`GET /api/reports/employee-sales` → `distributors[]`: `distributor`, `orderQty`, `orderPaise`), adding up to the order part of their primary. Secondary is still one figure per product, not per distributor. A manager sees this for their downline through the same endpoint; the phone may show it on the employee's sales screen (📱).

## 2c. Achievement now comes from the distributors (2026-10-14)

An employee's **achievement per product is the sum, over the distributors handed to them, of that product's secondary** (opening + units delivered, free included, − closing, from the distributor's stock statement or count), valued at **PTS**. The secondary the employee enters on the phone (and its approval) is kept as a record but **no longer counts** toward targets: label it informational, or hide it (📱). `primary` is now **supplied × price** (see [`orders-and-stock.md`](orders-and-stock.md)); units include free goods. Targets are still set by Admin or a manager (Sales dashboard > employee > Set a target on the web; the field app's targets screen for a manager).

## 3. Refs

[`LLD/sales-and-orders.md`](../LLD/sales-and-orders.md), [`LLD/marketing.md`](../LLD/marketing.md), [`orders-and-stock.md`](orders-and-stock.md), sign-off E1.
