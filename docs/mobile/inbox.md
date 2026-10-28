# Mobile — Inbox

What the field app shows in **Utility → Inbox**. Until now the phone had a demo screen with made-up messages ("the server has no inbox yet"); the server side now exists, so the demo (`inbox-demo.ts`) and the on-phone read flags (`inbox:read:<userId>`) should go. The server is the authority for what is in someone's inbox and whether they have read it. Design: [`LLD/inbox.md`](../LLD/inbox.md), [`decision-log.md`](../decision-log.md) (2026-10-12). Related: [`utility.md`](utility.md).

**Status key:** ✅ built on the server and web (Admin: **Daily work → Inbox messages**). 📱 the phone still has to show it.
**Field app, checked 2026-10-13 (typechecked and linted, not yet run on a phone):** built - list and message screens, unread badge on Home (99+), mark as read and mark all, offline copy, reads made offline sent later; the demo inbox and on-phone read flags are gone.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Who writes:** only an Admin, from the web portal. Nothing in the phone sends a message. A message goes to an **audience**: everyone, or any mix of roles, Zones, HQs and named people. A person who matches several parts gets **one** copy. | ✅ |
| 2 | **Delivery is fixed at send time.** The audience is worked out when the Admin presses Send. Someone who joins, or moves HQ, afterwards does **not** get an earlier message; someone who leaves keeps theirs. | ✅ |
| 3 | **Newest first.** `GET /inbox` is paged (`page`, `pageSize` ≤ 100). `?unread=true` returns unread only. | ✅ |
| 4 | **Unread badge:** `GET /inbox/unread-count` → `{ unread }`. Poll it when the app comes to the front and after a sync; push (below) only nudges the phone. | ✅ |
| 5 | **Reading:** `POST /inbox/:id/read` when the person opens a message (the `:id` is the item's `id`); `POST /inbox/read-all` for "Mark all as read". Reading twice is fine; `readAt` keeps the first time. An id that is not in this person's inbox is `404`. | ✅ |
| 6 | **Expiry:** an Admin may set `expiresAt`. After it the message is **gone from the list and the count** with no change to the phone. Do not keep it from an old cache. | ✅ |
| 7 | **Taken back:** an Admin can take a message back. It disappears from the list and the count at once. A phone showing a cached copy should drop it on the next fetch. | ✅ |
| 8 | **Push notifications:** every message here is also pushed (Firebase) once the phone registers its token. The inbox stays the record; a push only tells the phone to refresh this list. Contract, tables and routes in [`notifications.md`](notifications.md). | ✅ server (2026-10-15); phone open. ✅ phone polls (foreground, Home focus, reconnect) |
| 9 | **System messages:** a manager already gets some from the server (a new leave, monthly-expenses or new-doctor request from their team, a request waiting too long, a team member blocked: see [`team.md`](team.md)); they look like any other item (kind `UPDATE` or `REMINDER`, sent by the system). Later, other events (a target set, a late-submission exception, a call assigned) will put items here with the same shape. Which events notify whom is sign-off F8 and is still open; the phone needs no change when they arrive. | open |
| 10 | **Offline:** show the last fetched list with "Showing the list from …", the same as the Holiday List. Marking read while offline should be queued and sent when back online; an unsent read is only a missing tick, never lost mail. | ✅ |
| 11 | **Attachments (2026-10-22):** a message may carry up to **5 files** (PDF, JPG, PNG, WebP, Word `.docx`, Excel `.xlsx`, PowerPoint `.pptx`; 10 MB each) in `attachments[]` (section 2). Each has two links: **Open** (`url`: a PDF or picture shows in the viewer; Office files open in whatever app the phone has) and **Download** (`downloadUrl`: saves the file under its own name). Most messages have none (`[]`); messages sent before this have none. A taken-back message's files are deleted, so its links stop working: drop cached copies as for rule 7. | ✅ server and web; 📱 phone to show |
| 12 | **Message length (2026-10-22):** the body has **no length limit** any more (it was 2,000 characters). Show it in full on the message screen, scrollable, keeping line breaks; the list row shows the first line or two. The push carries only the first ~180 characters (with "📎 " in front when there are files); the whole text is in `GET /inbox`. | ✅ server and web; 📱 phone to check long text |
| 13 | **Named people:** the Admin can now pick one or more named employees of any role on the web (as well as or instead of roles, Zones and HQs). Nothing changes on the phone: it is still one copy per person. | ✅ |

## 2. What an item holds (`GET /inbox` → `items[]`)

| Field | Use |
|---|---|
| `id` | the message id; what you send to `/read` |
| `title`, `body` | heading and text (plain text; title ≤ 120 characters, the body any length; keep line breaks) |
| `kind` | `ANNOUNCEMENT`, `REMINDER`, `POLICY`, `UPDATE`: the chip or icon |
| `sentAt` | shown as "Today", "Yesterday" or the date |
| `expiresAt` | `null` = stays; automatic notifications are also deleted by the server after the Admin's retention setting (default 7 days) or when the Admin clears them, so they just vanish from the list on the next fetch; otherwise "Until …" is optional to show |
| `attachments[]` | files sent with it, in the order attached; `[]` for most. Each: `id`, `name` (as uploaded, e.g. `Price list Oct.pdf`), `kind` (`pdf`, `jpeg`, `png`, `webp`, `docx`, `xlsx`, `pptx`), `sizeBytes`, `url` (open), `downloadUrl` (save under `name`; the same as `url` for Word/Excel/PowerPoint, which always download) |
| `read`, `readAt` | bold/dot for unread; the badge counts `read = false` |

`GET /inbox` and `GET /inbox/unread-count` are open to every signed-in role and are **not** affected by the financial-year switch (the inbox is current mail, not a record of a year); do not send `X-Financial-Year` for them.

## 3. Screens

- **List:** rows newest first, unread in bold with a dot, pull to refresh, "Mark all as read" in the header, empty state "No messages".
- **Message:** title, kind, date, full body (scrollable, any length); opening it marks it read. Below the body, one row per attachment: an icon by `kind` (PDF, picture, Word, Excel, PowerPoint), the `name`, the size (`2 KB`, `3.4 MB`), and two actions: **Open** (`url`) and **Download** (`downloadUrl`).
- **List row:** a paperclip with the count ("📎 2") when `attachments` is not empty.
- **Download:** save to the phone's Downloads (Android) or offer the share sheet's "Save to Files" (iOS) under `name`; show progress for files over ~1 MB and a "Saved" or "Couldn't download, try again" message. Downloading needs a connection; it is not part of the offline copy (the list caches only the attachment details, never the files). Pictures may show a small preview from `url`.
- **Home badge:** the Utility tile (and Inbox row) show the unread count; hide at 0, show "99+" above 99.
