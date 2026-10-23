# Mobile — Notifications (push)

Server built 2026-10-15; **the phone is not built** (the app team's). Design: [`../LLD/notifications.md`](../LLD/notifications.md). Every push is also an Inbox message ([`inbox.md`](inbox.md)), so a missed push loses nothing.

## What the phone does

| # | Item | Status |
|---|---|---|
| 1 | **Ask for notification permission** (Android 13+, iOS), then get the Firebase (FCM) token. | phone |
| 2 | **Register the token after every login**, and whenever Firebase gives a new one: `PUT /identity/auth/push-token` `{ deviceId, token }` (same `deviceId` as login). `404` means no live session for that device; log in first. | ✅ server; phone open |
| 3 | **On logout** nothing is needed (the session ends, the token stops receiving). If the user turns notifications off in the app, call `DELETE /identity/auth/push-token` `{ deviceId }`. | ✅ server; phone open |
| 4 | **Show the push** with the system tray (the server sends `notification` + `data`). In the foreground, show an in-app banner and refresh `GET /inbox/unread-count`. | phone |
| 5 | **On tap, open the screen** named by `data.route` (table below). Unknown route: open the Inbox. | phone |
| 6 | **Do not rely on the push for state.** Keep polling the unread count on foreground, as in [`inbox.md`](inbox.md). | ✅ |

Payload: `notification.title`, `notification.body`, and `data` (all strings): `type`, `route`, `messageId` (the Inbox message id, to mark it read), and for reminders `period` (the date or `YYYY-MM`) and `stage`.

Routes the server sends (the phone maps them to its screens): `/plan/daily`, `/plan/monthly`, `/expenses`, `/stock`, `/leave`, `/dcr`, `/secondary`, `/doctors`, `/services`, `/team/approvals`, `/inbox`.

## What an MR (and every field employee) receives

Times are the defaults; each is an Admin setting (group *Notifications*). Nothing is sent when the thing is already sent, or on a day off, holiday, leave, before joining, or while blocked.

| When | Title (example) | `data.type` | Opens |
|---|---|---|---|
| 2 h before the daily plan deadline (10:00) | Send today's daily plan | `REMINDER_DAILY_PLAN` | `/plan/daily` |
| 30 min before | Send today's daily plan | `REMINDER_DAILY_PLAN` | `/plan/daily` |
| At the deadline | Missed: today's daily plan | `REMINDER_DAILY_PLAN` | `/plan/daily` |
| 3 days and 1 day before the monthly plan deadline (28th) | Send the plan for November 2026 | `REMINDER_MONTHLY_PLAN` | `/plan/monthly` |
| The morning after it | Missed: the plan for November 2026 | `REMINDER_MONTHLY_PLAN` | `/plan/monthly` |
| 3 days and 1 day before the expense deadline (7th); the morning after | Send September 2026 expenses / Missed: … | `REMINDER_EXPENSE_SUBMIT` | `/expenses` |
| 3 days and 1 day before the stock deadline (5th); the morning after | Send September 2026 stock counts / Missed: … | `REMINDER_STOCK` | `/stock` |
| A plan, leave, daily report, expense month, secondary sales, new doctor or doctor service is **approved or rejected** (once: plans and services need one approval, so one push on the first decision) | Your daily plan was rejected (body: the reason) | `DECISION_<KIND>` | the kind's screen |
| A manager or Admin **edits your monthly plan** while it waits for approval (2026-10-23) | Your tour plan was edited (body: who, the month and the reason) | `PLAN_AMENDED_MONTHLY_PLAN` | `/plan/monthly` |
| A manager or Admin gives a **late-submission exception** | You can send it late (body: until 15 Oct, 18:00) | `LATE_GRANT_<KIND>` | the screen |
| Admin **unblocks** you | You can submit again | `UNBLOCKED` | `/dcr` |
| Admin sends a message | the message | `INBOX` | `/inbox` |

If the server was down at a reminder time it sends only the latest due reminder, never two at once.

## What a manager receives

A manager gets everything in the table above for their **own** work, plus the team messages below. Counts, not names: the text says how many, and the screen it opens lists who.

| When | Title (example) | Body (example) | `data.type` | Opens |
|---|---|---|---|---|
| 2 h before the daily plan deadline | 7 of your team haven't sent today's daily plan | 7 of 40 on your team (3 direct) haven't sent today's daily plan. Due 10:00 (in 2 hours). | `REMINDER_DAILY_PLAN` | `/plan/daily` |
| 30 min after the deadline | 7 people missed today's daily plan | 7 of 40 … missed the 10:00 deadline … | `REMINDER_DAILY_PLAN` | `/plan/daily` |
| 3 days and 1 day before the monthly plan deadline; the morning after | 12 of your team haven't sent the plan for November 2026 / 12 people missed … | 12 of 40 … Due 28 Oct (in 3 days). | `REMINDER_MONTHLY_PLAN` | `/plan/monthly` |
| 3 days and 1 day before the expense send deadline; the morning after | 9 of your team haven't sent September 2026 expenses / 9 people missed … | 9 of 40 … | `REMINDER_EXPENSE_SUBMIT` | `/expenses` |
| 3 days and 1 day before the expense **approval** deadline (10th); the morning after | 10 expense months to approve / 10 expense months still waiting | 10 of your team's September 2026 expenses wait for your approval. Deadline 10 Oct (tomorrow). | `REMINDER_EXPENSE_APPROVAL` | `/team/approvals` |
| 10:30 and 17:00 daily, only when something waits | 120 requests waiting for you | 100 daily plans, 10 monthly plans, 5 expense months and 5 leave requests are waiting for your approval. | `REMINDER_APPROVALS_DIGEST` | `/team/approvals` |
| A team member sends a leave, expenses or new doctor; a request waits past the turnaround; someone is blocked | (existing team alerts, see [`team.md`](team.md)) | | `INBOX` | `/inbox` |

Notes for the phone:
- The "not sent" counts cover the whole downline; "direct" are those reporting straight to the manager. The approvals digest counts the manager's **direct** reports only, which is what they can act on.
- The manager's own "send it" reminders and the team messages can arrive together. Group them by `data.type` if the tray gets busy.
- Approving for the **expense send** deadline: the manager can give a late exception (Admin setting `LATE_EXPENSE_GRANT_BY_MANAGER`); the employee then receives `LATE_GRANT_EXPENSE_MONTH`.

## Testing without waiting for a deadline

Admin sets `DAILY_PLAN_SUBMIT_CUTOFF_TIME` to about 30 minutes from now (Settings → Planning): within 5 minutes the first reminder for the matching window arrives, and the next 5-minute run sends nothing more. An Admin broadcast (web: Inbox → Send) tests the push path on its own.
