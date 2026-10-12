# ERD 12 — Team alert marks

One small collection owned by the Team module, so the manager's alerts are sent once ([`../LLD/team.md`](../LLD/team.md)).

## `team_alert_marks`

| Field | Type | Notes |
|---|---|---|
| `key` | string, unique | `new:<approvalRequestId>:<cycle>` or `overdue:<approvalRequestId>:<cycle>` |
| `createdAt` | date | TTL index: removed after 90 days (far past any open request) |

Written with one atomic upsert per key; no references to other collections, nothing to migrate.
