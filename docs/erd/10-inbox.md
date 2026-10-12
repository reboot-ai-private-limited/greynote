# ERD 10: Inbox

Added 2026-10-12 for PRD §6.2 D (Utility → Inbox). Rules: [`../LLD/inbox.md`](../LLD/inbox.md).

```mermaid
erDiagram
    USER ||--o{ INBOX_MESSAGE : "created_by (null = system)"
    INBOX_MESSAGE ||--o{ INBOX_RECEIPT : "message_id"
    USER ||--o{ INBOX_RECEIPT : "user_id"

    INBOX_MESSAGE {
        id id PK
        string title
        string body
        enum kind "ANNOUNCEMENT, REMINDER, POLICY, UPDATE"
        json audience "everyone, roles[], zone_ids[], hq_ids[], user_ids[]"
        int recipient_count "fixed at send time"
        id created_by FK "null for a system message"
        timestamp created_at
        timestamp expires_at "nullable"
        timestamp retracted_at "nullable"
    }
    INBOX_RECEIPT {
        id message_id FK
        id user_id FK
        string title "copied from the message"
        string body "copied"
        enum kind "copied"
        timestamp sent_at "copied from created_at"
        timestamp expires_at "copied, nullable"
        timestamp read_at "nullable, first open"
    }
```

## Design decisions

- **Fan-out on write.** One receipt per recipient, with the text copied, so a person's inbox is one query on `(user_id, sent_at desc)` and who a message reached never changes later. A few hundred employees make the extra rows cheap.
- **`audience` is stored on the message** (for the Admin's sent list), not re-evaluated; the receipts are the truth of who got it.
- **Unique `(message_id, user_id)`**: a person matching several audience parts still gets one copy.
- **Retract deletes the receipts** and keeps the message row (`retracted_at`).
- Indexes: `InboxMessage(created_at desc)`; `InboxReceipt(message_id, user_id)` unique, `InboxReceipt(user_id, sent_at desc)`. No migration: new collections.
