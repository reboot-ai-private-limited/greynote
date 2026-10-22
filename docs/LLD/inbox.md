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
- **Push is a nudge on top (2026-10-15).** Every message saved here is also pushed to the recipients' phones when Firebase is set up ([`notifications.md`](notifications.md)); the phone still reads `GET /inbox` and `GET /inbox/unread-count`, and a missed push loses nothing. `notify()` takes `data` (`type`, `route` for the phone) and `push: false` to skip the push.
- **Attachments (2026-10-22).** An Admin's message may carry up to 5 files, 10 MB each: PDF, JPG, PNG, WebP, DOCX, XLSX, PPTX, the type read from the file's own bytes (an Office file is a ZIP whose parts sit in `word/`, `xl/` or `ppt/`; old `.doc`/`.xls`/`.ppt` are refused). Everything (audience, expiry, every file) is checked before anything is uploaded; files go to Cloudinary `greynote/inbox` (PDFs and pictures as images, Office files as raw files whose id keeps the extension); a failed upload or save removes the files already stored. The message keeps each file's `publicId`/`resourceType`; receipts copy only `id, name, kind, sizeBytes, url`, so the inbox is still one read. The API adds `downloadUrl` (Cloudinary `fl_attachment:<name>` for image-type files; raw files download as they are) via `shared/storage/downloadUrl.ts`, shared with Documents. Retract deletes the files (a failed delete doesn't stop the take-back); expiry keeps them. System messages (`notify`) have none.
- **No body limit (2026-10-22).** The body has no length limit of its own (was 2,000); only the request's 2 MB of text stops it (`express.json`, and multer's `fieldSize` for a multipart send). The title stays ≤ 120. The push carries a ~180-character preview (`pushPreview`), since Firebase refuses a payload over 4 KB; the Inbox has the whole text.
- Not scoped by the financial-year header (`/api/inbox*` are "timeless" in `financialYear.routes.test.ts`).

## HTTP surface (`/api/inbox`)

| Method | Path | Roles | Purpose |
|---|---|---|---|
| `GET` | `/?unread=&page=&pageSize=` | any | My inbox, newest first |
| `GET` | `/unread-count` | any | `{ unread }`, the badge |
| `POST` | `/:id/read` | any | Mark one read (`:id` = message id) |
| `POST` | `/read-all` | any | Mark all read |
| `POST` | `/messages` | Admin | Send: `{ title ≤120, body, kind, audience, expiresAt? }` as JSON, or multipart with that object as JSON in `payload` and up to 5 `files` → `{ id, recipientCount }` |
| `GET` | `/messages?page=&pageSize=` | Admin | Sent, newest first, with `recipientCount` and `readCount` |
| `DELETE` | `/messages/:id` | Admin | Take a message back |

## Edge cases

- **A message sent to a role that has nobody active** — `400 That audience has nobody in it`; nothing is saved.
- **Recipient count vs. reality** — it is the count at send time; people who join later are not counted and do not receive it.
- **Named people on the web** — the form searches active employees of any role by name or code and lists the chosen ones as chips (2026-10-22); they can be combined with roles, Zones and HQs.
- **Retracted messages' read counts** — receipts are deleted on retract, so the sent list shows no count for them.

## Deferred

Which further system events notify whom (sign-off F8, the rest is in [`notifications.md`](notifications.md)); scheduled sending; links; video attachments; per-person delete from the phone.
