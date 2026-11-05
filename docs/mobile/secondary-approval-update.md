# Field app: change list for the single secondary-sales approval kind (2026-11-05)

For the field-app team. The server now has **one** approval kind for secondary sales. The phone must follow it. Server contract: [`secondary-and-targets.md`](secondary-and-targets.md). The server change is on `main` (commit `bdd7fff0`).

## What changed on the server

| Before | Now |
|---|---|
| MR's month of per-distributor stock: approval kind `STOCK_COUNT`, record `userId:month` | kind **`SECONDARY_SALES`**, record `mrUserId:month` (same record id) |
| Manager's team report: kind `SECONDARY_ROLLUP` (new, never shipped on the phone) | kind **`SECONDARY_SALES`**, record `managerUserId:month:team` |
| Old per-product secondary: kind `SECONDARY_SALES`, record `userId:month`, `GET /sales/employee-sales` | **removed** |
| Distributor counts with approval (`POST /sales/stock-counts/submit`, `GET /sales/stock-counts`, setting `STOCK_COUNT_APPROVAL`) | **removed** (`404`) |

Removed routes now answer **404**: `GET /sales/employee-sales`, `POST /sales/employee-secondary`, `POST /sales/employee-secondary/submit`, `DELETE /sales/employee-secondary`, `POST /sales/employee-primary`, `POST /sales/stock-counts/submit`, `GET /sales/stock-counts`.

Still working and unchanged: `GET/POST /sales/secondary-stock`, `POST /sales/secondary-stock/submit`, `PATCH /sales/secondary-stock` (manager correction), `GET /sales/secondary-report`, the file routes `POST /sales/employee-secondary/attachments` and `DELETE /sales/employee-secondary/attachments/:id`, `GET /reports/employee-sales`, and the generic approval routes.

## Changes to make (in `apps/fieldApp/src`)

### Must change

1. **Approval kind rename.**
   - `lib/stock-counts.ts`: `STOCK_COUNT_KIND = 'STOCK_COUNT'` becomes `'SECONDARY_SALES'`. `findMyStockCountRequest` (look up my month's request) keeps `recordId === \`${userId}:${month}\``. Without this the screen cannot find the request, so **Withdraw** and the **reason a month was sent back** do not appear.
   - `lib/approvals.ts`: drop `STOCK_COUNT` from `KIND_LABEL` and `APPROVAL_KINDS`; `SECONDARY_SALES` stays ("Secondary sales").
   - `components/approval-row.tsx`: drop the `STOCK_COUNT` colour entry.
   - `components/approval-summary.tsx`: delete the `STOCK_COUNT` case. In the `SECONDARY_SALES` case show `StockCountSummary` (the MR report card with the manager's Correct figures) for `userId:month`, and the team-report card (below) when the record id ends in `:team`.
2. **Remove the old per-product card.** `SecondarySummary` in `approval-summary.tsx` calls `GET /sales/employee-sales` (404). Delete it, and delete `getEmployeeSales`, `saveEmployeeSecondary` and `submitEmployeeSecondary` from `lib/sales.ts` (also `SECONDARY_STATUS_TEXT` if nothing else uses it). Keep `addSecondaryFile` and `removeSecondaryFile`.
3. **Drop the dead flag.** `lib/public-config.ts`: remove `stockCountApproval` and `noteStockApprovalOn`; the setting no longer exists and nothing else reads it.

### Should change (new feature, optional until you want managers to submit from the phone)

4. **Manager's team report.** A manager's own achievement is a report they submit and their manager approves (0 until approved).
   - `GET /sales/secondary-rollup?userId=<me>&month=YYYY-MM`: `status` (`NOT_SUBMITTED | DRAFT | PENDING | APPROVED | REJECTED`), `saved`, `designation`, `mrCount`, `approvedMrCount`, `outOfDate`, `canSubmit`, `requestId`, `distributors[]`, `totals`, `sources[]` (each MR's report: `requestId`, `status`, totals).
   - `POST /sales/secondary-rollup/submit { month }` (manager only, `403 MANAGER_ONLY`; `409 SECONDARY_NOTHING_TO_SEND`, `409 SECONDARY_LOCKED`). Enable **Submit** only when `canSubmit`.
   - Show "6 of 8 MRs approved", an **out of date** notice (`outOfDate`), and a status chip.
   - Approval card for a record `managerUserId:month:team`: the same data as above, read-only, for the upper manager.
   Full rules: `secondary-and-targets.md`, "The manager's team report".

## Will the build already published keep working?

Assuming it is the build in the repo (it already uses `/sales/secondary-stock`, so the MR screen is current), **most of it works and two things degrade**:

| Area | Published build against the new server |
|---|---|
| MR: view, save draft, edit, attach files, **submit** a month | Works (routes unchanged) |
| MR: status chip, targets, reports | Works |
| MR: **Withdraw** and the **reason it was sent back** | **Missing**: the screen looks for the request under kind `STOCK_COUNT`, which no longer exists. The MR can still edit a sent-back month and send it again. |
| Manager: **approval card** for an MR's month | **Shows an error instead of the figures**: the new requests are kind `SECONDARY_SALES`, and the old card behind that kind calls the removed `employee-sales`. Approve and Reject are generic, so they should still work, but the manager decides without seeing the numbers on the phone (the web shows them). |
| Manager: **Correct figures** before approving | **Unreachable** from the phone (it lives on the `STOCK_COUNT` card); works on the web. |
| Manager: team report submit | Not in the build yet (managers read 0 until they submit, from a build with item 4) |

Nothing crashes: the removed routes are only called from the approval card, and the app treats a failed read as an error panel. Items 1 to 3 fix both degraded areas; they are small and low risk. If the app can ship JavaScript-only updates (EAS Update), send 1 to 3 as soon as they are ready, without waiting for a store release.

## Test checklist

- MR: save a draft, attach a file, submit; the month shows **Waiting**; **Withdraw** appears; withdraw it; submit again; have a manager reject it and check the reason shows.
- Manager: open the Approvals tab, **Secondary sales** chip: the card shows the figures; **Correct figures** works while Waiting; Approve; the MR sees **Approved**.
- Manager with MRs: team report loads, submit is enabled only with at least one approved MR report, the out-of-date notice appears after an MR report is reopened.
- No call to a removed route (`employee-sales`, `employee-secondary` other than `/attachments`, `stock-counts`) remains in the app (search the source).
