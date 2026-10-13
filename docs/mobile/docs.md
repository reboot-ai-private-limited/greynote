# Mobile — Docs

What the field app does for the **Docs** tab (PRD §6.2 C): the employee's own **payslips** and the **documents** an Admin shares. The server decides what is shown to whom; the phone lists and opens files. Design: [`LLD/payroll.md`](../LLD/payroll.md), [`LLD/documents.md`](../LLD/documents.md), [`decision-log.md`](../decision-log.md) (2026-10-12). Related: [`financial-year.md`](financial-year.md), [`utility.md`](utility.md).

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it. The phone app is another team's; these notes are the contract it builds against.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - the Docs tab with Payslips (`/payroll/me`, bounded by the financial year, slip opens with earnings, deductions, gross and net) and Documents (`/documents`, by category, opens the file).

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | The tab has two lists: **Payslips** and **Documents**. | ✅ |
| 2 | **Payslips are bounded by the financial year.** `GET /payroll/me` returns the signed-in employee's slips for the year in view: the current year, or the year named by `X-Financial-Year` (see [`financial-year.md`](financial-year.md)). To see older slips the employee switches year on the **Financial Year** screen; the Docs tab then shows that year, with the "Viewing FY … Read-only" banner. | ✅ |
| 3 | **Only finalized slips appear.** A month is on the list once the Accountant has finalized payroll for it; a draft is never shown. A month with no slip is just absent (not yet finalized, or no CTC then). | ✅ |
| 4 | **The slip is ready to draw.** Each item is `{ id, month, finalizedAt, slip }`; `slip` has `earnings[]` and `deductions[]` (`{ label, amountPaise }`), `grossPaise`, `deductionPaise`, `netPaise`. Money is in paise. The phone adds nothing up itself. Employer contributions (EPF/ESI) are not on the slip. | ✅ |
| 5 | **Only your own.** The endpoint is `FIELD`-only and takes no user id; nobody can ask for another employee's slip. | ✅ |
| 6 | **Documents are not tied to a year.** `GET /documents` returns what an Admin shared with everyone or named this employee, newest first, whichever year is selected. Each has `title`, `category` (`POLICY`, `CIRCULAR`, `FORM`, `OTHER`), `fileKind` (`pdf`, `jpeg`, `png`), `sizeBytes`, `url`, `uploadedAt`. The employee never sees who else it is for. | ✅ |
| 7 | **Opening a file** = open `url` (PDF/image) in the system viewer, with a share/save option. Files are small (≤ 10 MB) so no download manager is needed. | ✅ |
| 8 | **Admin adds and removes documents on the web** (Documents page). The phone cannot upload. A removed document disappears on the next refresh. | ✅ |

## 2. What the phone should show

- **Payslips:** one row per month, newest first: "September 2026 · Net ₹…". Tapping opens the slip: earnings, deductions, gross, net. Empty state: "No payslips for FY 2026-27 yet. They appear once payroll is finalized."
- **Documents:** grouped or filterable by category; a row shows the title, kind and size.
- In a past year the Payslips list shows that year's slips and the Documents list is unchanged.

## 3. Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/payroll/me?fromMonth&toMonth` | Own finalized slips for the year in view; the two months (`YYYY-MM`) narrow it inside the year. |
| `GET` | `/documents` | Documents for this employee (everyone's, or naming them). |

Errors: `400 OUTSIDE_FINANCIAL_YEAR` when a month is outside the year; `409`/`FINANCIAL_YEAR_READ_ONLY` never applies to these reads.
