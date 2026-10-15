# ERD 13 — Notifications

Design: [`../LLD/notifications.md`](../LLD/notifications.md).

## `usersessions.pushToken` (Identity, existing collection)

| Field | Type | Notes |
|---|---|---|
| `pushToken` | string, null | The phone's Firebase token, set by `PUT /identity/auth/push-token`. Sparse index. Only read while the session is live (`revokedAt` null, not expired); registering it on another account clears it here |
| `pushTokenAt` | date, null | When it was last registered |

No migration: older sessions read as no token until the phone registers one.

## `remindermarks` (Reminders)

| Field | Type | Notes |
|---|---|---|
| `key` | string, unique | `rem:<TYPE>:<period>:<AUDIENCE>:<stage>` (for example `rem:DAILY_PLAN:2026-10-15:EMPLOYEE:first`), or `rem:DIGEST:<date>:<morning\|evening>` |
| `createdAt` | date | TTL index: removed after 90 days |

Written with one atomic upsert per key, so the reminder stage fires once whichever server reaches it first. No references to other collections.
