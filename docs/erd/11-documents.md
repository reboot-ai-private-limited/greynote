# ERD 11: Documents

Added 2026-10-12 for the phone's Docs tab. Rules: [`../LLD/documents.md`](../LLD/documents.md).

```mermaid
erDiagram
    USER ||--o{ COMPANY_DOCUMENT : "uploaded_by"
    USER }o--o{ COMPANY_DOCUMENT : "user_ids (when not for everyone)"

    COMPANY_DOCUMENT {
        id id PK
        string title
        enum category "POLICY, CIRCULAR, FORM, OTHER"
        enum file_kind "pdf, jpeg, png"
        string url "Cloudinary"
        string public_id "to delete the file"
        int size_bytes
        bool everyone "true when no people are named"
        id_list user_ids "empty when everyone"
        id uploaded_by FK
        timestamp uploaded_at
    }
```

Indexes: `uploaded_at` descending; `user_ids` + `uploaded_at` for an employee's list.
