# Mobile — Secondary sales and targets

How an employee's monthly **secondary** is entered and approved, and how **targets** and **achievement** relate to it. Online only. Decision: decision-log 2026-10-12.

**Changed 2026-11-02:** after the stock deadline an employee given a secondary exception (web) can still enter figures and files. Still `MONTH_CLOSED` for everyone else. No phone change needed. See [`../LLD/lateGrants.md`](../LLD/lateGrants.md).

**Changed 2026-11-03:** (1) **Admin can delete a month's secondary:** `DELETE /api/sales/stock-counts?userId=&month=` (was `DELETE /api/sales/employee-secondary` until 2026-11-05) (Admin only, `403 ADMIN_ONLY` otherwise) removes every line's units, amount and status, the month's files (and the stored copies) and its approval request; Admin's primary change on a line stays. No deadline for Admin; `MONTH_NOT_STARTED` / closed financial year still apply. An empty month is not an error. The phone does not offer this (Admin works on the web). (2) **A manager can edit a team member's month** with the existing `POST /employee-secondary` and the attachment calls (`userId` for someone else's month): the phone has an **Edit figures** button on the approval card and under Team > Stock & secondary. Only the lines the manager changes become `APPROVED`; lines left alone stay `PENDING` and the request stays open until it is decided.

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
| 4 | Approving or rejecting stays on the Approvals screen (kind `SECONDARY_SALES`, record `mrUserId:month`). |

#### The manager's team report: submit it, it becomes their achievement (2026-11-05)

A manager's own achievement is a report they **submit** and their own manager (Admin if none) **approves**; until it is approved their achievement is **0**. The report is read-only: it is the sum of the approved MR reports below them.

| # | Rule |
|---|---|
| 1 | **Read:** `GET /api/sales/secondary-rollup?userId=<manager>&month=YYYY-MM` returns `status` (`NOT_SUBMITTED`, `DRAFT`, `PENDING`, `APPROVED`, `REJECTED`), `saved`, `designation` (`{ name, level }` when submitted), `mrCount`, `approvedMrCount`, `outOfDate`, `canSubmit`, `requestId`, `submittedAt`, `approvedAt`, `distributors[]` (as the manager view above, in units and at PTS), `totals` and `sources[]`. Before it is sent it is the live sum; after, the saved snapshot. |
| 2 | **Submit:** `POST /api/sales/secondary-rollup/submit { month }`, only a manager (someone with MRs below them), `403 MANAGER_ONLY` otherwise. The month must have started. There is no entry deadline. Keep **Submit** disabled unless `canSubmit` is true. |
| 3 | `409 SECONDARY_NOTHING_TO_SEND` when none of the MRs has an approved report for the month; `409 SECONDARY_LOCKED` while it is waiting or approved. It opens again after a rejection, a withdrawal or when Admin reopens it. |
| 4 | **Only approved MR reports go in.** `sources[]` lists every MR below the manager with the status of their report (`APPROVED`, `SUBMITTED`, `NOT_SUBMITTED` ...), a reference to that report (`requestId`, `cycle`, `decidedAt`) and the MR's totals. Show "6 of 8 MRs approved". Each source is a tap-through to that MR's report. |
| 5 | **Out of date:** when `outOfDate` is true an MR report was approved, reopened or approved again after the manager sent it. Show a notice and let the manager withdraw and send again; the saved figures do not move by themselves. |
| 6 | **After approval** the saved report is the manager's achievement for the month: `designation` records what they were then (for example RSM), so a later promotion or team change does not alter it. Reports show a status chip (`Report not sent`, `waiting`, `approved`, `rejected`) beside a manager's achievement. |
| 7 | Deciding it is on the Approvals screen as kind `SECONDARY_SALES` too, with record `managerUserId:month:team` (an MR's own report is `mrUserId:month`). There is one kind and one tab, 'Secondary sales'. |

#### Correcting figures before approving (2026-11-05)

A manager does not enter figures, but may **correct** what an MR already sent while it waits for approval, so one typo does not cost a reject and resubmit.

`PATCH /api/sales/secondary-stock`

```json
{ "userId": "<MR id>", "month": "2026-11", "reason": "Typo in issued", "lines": [{ "distributorId": "…", "productId": "…", "openingQty": 10, "primaryQty": 20, "issuedQty": 7 }] }
```

Returns `{ changed }` (lines whose figures actually differ; identical lines are skipped).

| # | Rule |
|---|---|
| 1 | **Who:** the manager above that MR (any depth), or Admin. The MR cannot use it on themselves (`403 NOT_YOUR_TEAM`, they save instead); anyone outside the MR's upline gets `403 NOT_YOUR_TEAM`. |
| 2 | **When:** only lines that are `PENDING` (`409 SECONDARY_NOT_PENDING` for a draft, rejected or approved line). To change an approved month, Admin reopens it. No stock-deadline check; the financial year must be open. |
| 3 | **What:** only lines the MR already sent. A distributor and product the MR did not send is `400 INVALID_PAYLOAD`: a manager cannot add or remove rows. Whole units, 0 or more; issued more than opening + primary is `400 INVALID_PAYLOAD`. |
| 4 | **Reason is required** (3 to 300 characters): `400` from the body check, `ADJUSTMENT_NEEDS_REASON` if it is blank. Ask for it in a text box before the save button works. |
| 5 | **Shown afterwards:** `GET /sales/secondary-stock` returns `managerEdit` on each corrected line, otherwise `null`: `{ by: { id, name }, at, reason, original: { openingQty, primaryQty, issuedQty } }`. `original` is what the MR entered, kept from the first correction even after further ones. Mark such lines (for example an "Adjusted by <name>" chip) and show `original` on tap, on the MR's own screen too. |
| 6 | **The MR is in control again after a rejection or withdrawal.** When the MR saves the rows again their figures replace the correction and `managerEdit` goes back to `null`. |
| 7 | Approving afterwards counts the corrected figures. Every correction is written to the server audit log. |

**Phone UX.** On the manager's approval card, make the figure cells of a `PENDING` month tappable, edit in place with the same three steppers (Closing recalculated, never typed), and send one `PATCH` for all the lines changed together with the reason. On a `403`/`409`, refresh with the `GET` and show the message.

**Achievement and every sales report (2026-11-05, later):** only **approved** MR rows count, and they are the single source. Achievement is each approved row's issued units at PTS, credited to the MR who entered it; **primary** in the reports is the same rows' primary (received) units, not Done orders. A manager is the sum of the MRs below them and a total counts each MR once. A month with nothing approved reads **0** everywhere (the web Sales report, Sales dashboard and employee report). Distributor statements, distributor counts and Done orders no longer feed them.

**The old "Distributor stock" counting tab and the "My record" tab are replaced** by this screen. `orders-and-stock.md` says the Monthly-stock tab is removed from the phone; that stays true, this is a different screen. The old `POST /sales/monthly-stock` (opening and closing counts) remains for older builds.

## Removed on 2026-11-05: the old distributor-count and per-product flows

The distributor **count approval** (`POST /api/sales/stock-counts/submit`, `GET /api/sales/stock-counts`, the `STOCK_COUNT` approval kind and the `STOCK_COUNT_APPROVAL` switch) and the old **per-product secondary** (`GET /api/sales/employee-sales`, `POST /api/sales/employee-secondary`, `POST /api/sales/employee-secondary/submit`, `DELETE /api/sales/employee-secondary`, `POST /api/sales/employee-primary`, and the `SECONDARY_SALES` per-product approval) are **gone**. They return `404`. The Secondary Sales screen above replaces them; `POST /api/sales/monthly-stock` still saves an opening/closing count at once (no draft, no approval). A phone build that still calls the removed routes must be updated.

**The one approval kind is `SECONDARY_SALES`** (label "Secondary sales"): an MR's month is `mrUserId:month`, a manager's team report is `managerUserId:month:team`.

## 1b. Files on the month (2026-11-02) 📱

An employee can attach **photos or PDFs** to a month's secondary, for example a picture of the distributor's sales statement. They belong to the employee and the month, not to a product line. **There is no limit on how many.** Attaching is **required** on the Secondary Sales screen of 2026-11-05 (`ATTACHMENT_REQUIRED` on submit; see its rule 10) and stays optional only for the retired per-product *Send for approval*.

| # | Rule | Status |
|---|---|---|
| 1 | **Add:** `POST /api/sales/employee-secondary/attachments`, `multipart/form-data` with `file` (one per call; send several files as several calls), `month` (`YYYY-MM`) and, only when working on someone else's month, `userId`. Returns the file: `{ id, url, fileName, mimeType, sizeBytes, uploadedBy, uploadedAt }`. | ✅ 📱 |
| 2 | **Type and size:** a **PDF, JPG or PNG** of at most **5 MB**. The server reads the type from the file's own bytes, so renaming a file does not get it through. `400` with `field: file` otherwise (`INVALID_PAYLOAD`). Compress or resize a photo on the phone before sending. | ✅ 📱 |
| 3 | **Read:** `GET /api/sales/secondary-stock?userId=&month=` returns **`attachments[]`** (oldest first, `[]` when none). Open `url` to view a file. | ✅ 📱 |
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
