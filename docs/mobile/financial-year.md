# Mobile — Financial Year

What the field app does for **Utility → Financial Year**, the "time machine" of PRD §6.2 D. Reports, the Holiday List and the Orders list can show a past financial year, read-only. The server decides what a past year means; the phone just names the year in a header. Design: [`hld/09-financial-year-toggle.md`](../hld/09-financial-year-toggle.md), [`decision-log.md`](../decision-log.md) (2026-09-30, 2026-10-12). Related: [`holidays.md`](holidays.md), [`utility.md`](utility.md).

**Status key:** ✅ built on the server and web (the portal's top bar has the same switch). 📱 built on the phone but **not yet run on a real phone**.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **A year is named by the year it starts in.** With an April start (`FY_START_MONTH`), FY2025 is 2025-04-01 to 2026-03-31, shown "FY 2025-26". The start month comes from `GET /config/public` → `financialYearStartMonth` (or the sync snapshot's `FY_START_MONTH`). It is a setting, never hard-coded. | ✅ |
| 2 | **Selecting a past year = send `X-Financial-Year: 2025`** on **reads**. No header, or the current year, is normal. A year in the future is `400`. The choice is for this sign-in only and is not saved on the server. | ✅ |
| 3 | **A past year is read-only everywhere.** Any save, approval or other write sent with a past-year header is refused: `409 FINANCIAL_YEAR_READ_ONLY`. The phone must not send the header with a write or a sync push; the background sync never sends it. | ✅ |
| 4 | **Dates outside the year** on a scoped list are `400 OUTSIDE_FINANCIAL_YEAR`, never trimmed silently. Leave the dates out and the list defaults to that year. | ✅ |
| 5 | **Which screens honour it:** reports, daily reports (DCR), expenses, daily and monthly plans, leaves and leave balances, orders, approvals lists (by when submitted). **Not scoped:** the Holiday List (ask for the year's `from`/`to` instead, see [`holidays.md`](holidays.md)), the Inbox, and master data (products, doctors, chemists). | ✅ |
| 6 | **Which years to offer:** the current year and up to five earlier ones (`FY_YEARS_BACK`), as the phone does now. The server accepts any past year; a year with no data just returns empty lists. | ✅ |
| 7 | **A closed year** (Admin closes it after the last payout) refuses payroll and expense-payment changes (`409 FY_CLOSED`) whatever the toggle, **and any daily work dated inside it**: daily reports and their calls and expenses, daily and monthly plans, orders, leave and secondary sales. Closing needs the year to have ended, so today's work is never in a closed year; this bites late and back-dated records, and a plan or leave for a past month. `GET /config/public` returns `closedFinancialYears` (start years, e.g. `[2024]`). When the year being viewed is in that list the phone shows "FY 2024-25 is closed. Read-only." and turns its work screens off; if a write still goes out the answer is `409 FY_CLOSED` with the message to show. | ✅ / 📱 |
| 8 | **Reset on sign-out and on a new day's current year:** a pick left from another employee, or one that is no longer past (the year rolled over), must clear the header. The phone already does this. | 📱 |

## 2. What the phone should show

- The year list: "FY 2026-27 · current" first, then earlier years, each with its date range; the chosen one marked "Selected".
- While a past year is selected, a banner on every screen that honours it: "Viewing FY 2025-26. Read-only." with a way back to the current year.
- Buttons that save are off, or hidden, in that state. If one is still pressed the server answers `409 FINANCIAL_YEAR_READ_ONLY`: show "This is a past year. Go back to the current year to change anything."
