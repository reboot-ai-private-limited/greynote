# Mobile — Inbox

What the field app shows in **Utility → Inbox**. Until now the phone had a demo screen with made-up messages ("the server has no inbox yet"); the server side now exists, so the demo (`inbox-demo.ts`) and the on-phone read flags (`inbox:read:<userId>`) should go. The server is the authority for what is in someone's inbox and whether they have read it. Design: [`LLD/inbox.md`](../LLD/inbox.md), [`decision-log.md`](../decision-log.md) (2026-10-12). Related: [`utility.md`](utility.md).

**Status key:** ✅ built on the server and web (Admin: **Daily work → Inbox messages**). 📱 the phone still has to show it.

## 1. The rules

| # | Rule | Status |
|---|---|---|
| 1 | **Who writes:** only an Admin, from the web portal. Nothing in the phone sends a message. A message goes to an **audience**: everyone, or any mix of roles, Zones, HQs and named people. A person who matches several parts gets **one** copy. | ✅ |
| 2 | **Delivery is fixed at send time.** The audience is worked out when the Admin presses Send. Someone who joins, or moves HQ, afterwards does **not** get an earlier message; someone who leaves keeps theirs. | ✅ |
| 3 | **Newest first.** `GET /inbox` is paged (`page`, `pageSize` ≤ 100). `?unread=true` returns unread only. | ✅ |
| 4 | **Unread badge:** `GET /inbox/unread-count` → `{ unread }`. Poll it when the app comes to the front and after a sync; there is **no push** yet (below). | ✅ |
| 5 | **Reading:** `POST /inbox/:id/read` when the person opens a message (the `:id` is the item's `id`); `POST /inbox/read-all` for "Mark all as read". Reading twice is fine; `readAt` keeps the first time. An id that is not in this person's inbox is `404`. | ✅ |
| 6 | **Expiry:** an Admin may set `expiresAt`. After it the message is **gone from the list and the count** with no change to the phone. Do not keep it from an old cache. | ✅ |
| 7 | **Taken back:** an Admin can take a message back. It disappears from the list and the count at once. A phone showing a cached copy should drop it on the next fetch. | ✅ |
| 8 | **No push notifications yet.** The inbox is a list the app reads. Push (FCM) will be added later and will only tell the phone to refresh this list. | ✅ server; 📱 poll |
| 9 | **System messages:** later, other events (a target set, a late-submission exception, a call assigned) will put items here with the same shape. Which events notify whom is sign-off F8 and is still open; the phone needs no change when they arrive. | open |
| 10 | **Offline:** show the last fetched list with "Showing the list from …", the same as the Holiday List. Marking read while offline should be queued and sent when back online; an unsent read is only a missing tick, never lost mail. | 📱 |

## 2. What an item holds (`GET /inbox` → `items[]`)

| Field | Use |
|---|---|
| `id` | the message id; what you send to `/read` |
| `title`, `body` | heading and text (plain text, ≤ 120 and ≤ 2000 characters; keep line breaks) |
| `kind` | `ANNOUNCEMENT`, `REMINDER`, `POLICY`, `UPDATE`: the chip or icon |
| `sentAt` | shown as "Today", "Yesterday" or the date |
| `expiresAt` | `null` = stays; otherwise "Until …" is optional to show |
| `read`, `readAt` | bold/dot for unread; the badge counts `read = false` |

`GET /inbox` and `GET /inbox/unread-count` are open to every signed-in role and are **not** affected by the financial-year switch (the inbox is current mail, not a record of a year); do not send `X-Financial-Year` for them.

## 3. Screens

- **List:** rows newest first, unread in bold with a dot, pull to refresh, "Mark all as read" in the header, empty state "No messages".
- **Message:** title, kind, date, full body; opening it marks it read.
- **Home badge:** the Utility tile (and Inbox row) show the unread count; hide at 0, show "99+" above 99.
