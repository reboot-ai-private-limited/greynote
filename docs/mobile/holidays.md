# Mobile — Holiday List

What the field app shows in **Utility → Holiday List**. The Admin now **uploads the year's holiday list** from the web portal (one CSV, previewed before saving); the phone only reads it. The server is the authority; the phone's copy is a UX aid for offline. Design: [`LLD/hr.md`](../LLD/hr.md), [`decision-log.md`](../decision-log.md) (2026-10-12). Related: [`leave.md`](leave.md) (holidays inside a leave range are not counted), [`financial-year.md`](financial-year.md), [`utility.md`](utility.md).

**Status key:** ✅ built on the server and web (HR → Leave & holidays → Holidays; Admin has **Upload list**). 📱 the phone already shows the list, and needs only the checks below.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Which holidays an employee sees:** National ones, ones tagged with their Zone, and ones tagged with their HQ. A holiday can be tagged with several Zones or HQs. With no HQ set, only National ones. The server filters; the phone never has to. | ✅ |
| 2 | **Read:** `GET /hr/holidays?from=YYYY-MM-DD&to=YYYY-MM-DD`, both required, **at most 400 days** apart (`400` otherwise). Returns `id`, `name`, `date`, `scope` (`NATIONAL`, `ZONE`, `HQ`) and the tagged `zoneIds` / `hqIds`. Oldest first. | ✅ |
| 3 | **The weekly off day is not a holiday row.** It is the setting `WEEKLY_OFF_DAY` (sync snapshot `config.settings`), shown as "Weekly off: every Sunday". | ✅ |
| 4 | **Previous financial years:** the list is not scoped by the financial-year header. To look at a past year, ask for **that year's `from` and `to`** (from [`financial-year.md`](financial-year.md)). A past year is read-only like every other screen; nothing on this screen can be changed anyway. | ✅ |
| 5 | **The list can change after upload.** HR/Admin may add or remove a holiday at any time. Pull to refresh; keep "Showing the list from …" for an offline copy. A leave already counted keeps the days it was counted with. | ✅ |
| 6 | **Who maintains it:** the Admin uploads (and HR/Admin can add or remove single holidays) on the web. **Nothing here is edited on the phone.** | ✅ |
| 7 | **TA/DA on holidays** is a separate, still-open question (sign-off D6) and does not change this list. | open |

## 2. What the Admin's upload means for the phone

The upload (`POST /hr/holidays/import`) adds rows in bulk: a file with any bad line adds nothing, and holidays already on the calendar (same name, date and places) are skipped, so re-uploading is safe. It needs no phone change: the next fetch simply returns more rows. A holiday dated in the past or the future is accepted, which is how earlier years' lists can be loaded.

CSV columns (for reference; the Admin sees a template in the portal):

| Column | Meaning |
|---|---|
| `name` | up to 100 characters |
| `date` | `YYYY-MM-DD` |
| `scope` | `NATIONAL`, `ZONE` or `HQ` |
| `zones` | Zone names, `;`-separated; for `ZONE` only |
| `hqs` | `Zone/HQ`, `;`-separated; for `HQ` only |

## 3. What the phone should show

- A month at a time (the existing `MonthStepper`), limited to the selected financial year's first and last month.
- Each row: the name, the date with weekday, and a chip "National", "Zone" or "HQ". Zone/HQ rows need no place name: the server only returns the ones that apply.
- "Weekly off: every Sunday." under the month.
- Empty month: "No holidays this month."
- Cache each month under its own key so a month already seen opens offline.
