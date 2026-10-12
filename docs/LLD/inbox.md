# LLD: Inbox

Messages an Admin sends to the phone app's **Utility → Inbox** (PRD §6.2 D). Tier 3 module `inbox`; entities in [`../erd/10-inbox.md`](../erd/10-inbox.md). The phone side is [`../mobile/inbox.md`](../mobile/inbox.md). Not to be confused with `GET /approvals/inbox` (approvals waiting for a manager).

## Public contract

```ts
interface InboxPublicContract {
  /** Sends a system message to these active employees; returns how many it reached. */
  notify(userIds: string[], input: { title: string; body: string; kind: InboxKind; expiresAt?: Date }): Promise<number>;
}
```

Team's manager alerts call `notify` (2026-10-12, see [`team.md`](team.md)); nothing else does yet. It is the hook the decision-log promised ("decisions emit an event where notifications will plug in"): when sign-off F8 says which events notify whom (a target set, a late-submission exception, a call assigned), the owning module calls it. Inbox depends only on Identity (`listActiveRecipients`: id, role, HQ, Zone of every active user) and Territory (Zone/HQ exist and are active).

## Rules

- **Audience** = `everyone`, or any mix of `roles[]`, `zoneIds[]`, `hqIds[]`, `userIds[]`; a person matching any part gets the message once. `everyone` cannot be combined with other parts. Zones and HQs reach field employees only (the only people who have one). An empty audience, an inactive/unknown Zone or HQ, an unknown or inactive named person, or an audience that resolves to nobody is `400`.
- **Fan-out on write.** Sending resolves the audience *now* and writes one `InboxReceipt` per person, with the title, body and kind copied onto it. A later joiner or HQ move changes nothing; the sent list's `recipientCount` is fixed. A person's inbox is one indexed read.
- **Expiry** (`expiresAt`, must be in the future) is on the receipt too, so an expired message drops out of the list and the unread count in the query, with no job.
- **Retract** (Admin) marks the message `retractedAt` and deletes its receipts. Recipients lose it at once; the sent list keeps the row (shown "Taken back", no read count). A second retract is `409`.
- **Read** sets `readAt` once (the first open). `POST /inbox/:id/read` on a message not in the caller's inbox is `404`.
- **No push.** Delivery is the phone reading `GET /inbox` and `GET /inbox/unread-count`. FCM can be added later as a notifier that only tells the phone to refresh.
- Not scoped by the financial-year header (`/api/inbox*` are "timeless" in `financialYear.routes.test.ts`).

## HTTP surface (`/api/inbox`)

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/?unread=&page=&pageSize=` | any | My inbox, newest first |
| `GET` | `/unread-count` | any | `{ unread }`, the badge |
| `POST` | `/:id/read` | any | Mark one read (`:id` = message id) |
| `POST` | `/read-all` | any | Mark all read |
| `POST` | `/messages` | Admin | Send: `{ title ≤120, body ≤2000, kind, audience, expiresAt? }` → `{ id, recipientCount }` |
| `GET` | `/messages?page=&pageSize=` | Admin | Sent, newest first, with `recipientCount` and `readCount` |
| `DELETE` | `/messages/:id` | Admin | Take a message back |

## Edge cases

- **A message sent to a role that has nobody active** — `400 That audience has nobody in it`; nothing is saved.
- **Recipient count vs. reality** — it is the count at send time; people who join later are not counted and do not receive it.
- **Named people on the web** — the API takes `userIds`, the web form offers Everyone, roles, Zones and HQs only (a people picker can be added without an API change).
- **Retracted messages' read counts** — receipts are deleted on retract, so the sent list shows no count for them.

## Deferred

Push (FCM); which system events notify whom (sign-off F8); scheduled sending; attachments and links; per-person delete from the phone.
