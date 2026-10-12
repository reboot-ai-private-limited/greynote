# Mobile — Utility

The **Utility** section of the Home tab (PRD §6.2 D) is now exactly three entries: **Inbox**, **Holiday List** and **Financial Year**. **Forms is removed** (decision-log 2026-10-12): there is no endpoint behind it and none is planned, so the phone should drop the tile and its placeholder screen.

| Entry | Server | Mobile note |
|---|---|---|
| Inbox | ✅ built (new) | [`inbox.md`](inbox.md) |
| Holiday List | ✅ built; the Admin now uploads the list | [`holidays.md`](holidays.md) |
| Financial Year | ✅ built | [`financial-year.md`](financial-year.md) |

The Team tab's "Inbox" (approvals waiting for a manager, `GET /approvals/inbox`) is a different thing and is not part of this section.

**Status key:** ✅ built on the server and web. 📱 the phone still has to show it. The phone app is another team's; these notes are the contract it builds against.
