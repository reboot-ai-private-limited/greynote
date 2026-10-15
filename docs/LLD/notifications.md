# LLD — Notifications (push and reminders)

Built 2026-10-15, backend only. The phone app registers a Firebase token and shows pushes; that work is the phone team's ([`../mobile/notifications.md`](../mobile/notifications.md)).

## What it is

Three parts:

1. **Push delivery.** Every message that lands in the Inbox is also pushed to the recipient's phones (Firebase Cloud Messaging). The push is a nudge; the Inbox row is the record. Without the Firebase key, or with `PUSH_ENABLED` off, nothing is pushed and the Inbox works as before.
2. **Scheduled reminders** (the `reminders` module): deadline warnings to employees, and "N have not submitted" and "N are waiting for you" messages to managers.
3. **Immediate messages**: the answer to a request, a late-submission exception, an unblock.

## Push delivery

| Piece | Where |
|---|---|
| Token store | `UserSession.pushToken` (one per logged-in device). `PUT` / `DELETE /api/identity/auth/push-token` |
| Who gets a push | The recipients' **live** sessions with a token. A logged-out, expired or revoked session is never pushed to |
| Sender | `shared/push`: `PushSenderPort`, `FcmPushSender` (firebase-admin, batches of 500) and a no-op when unconfigured |
| Hook | `PublishMessageUseCase`, after the Inbox rows are saved. `notify(..., { push: false })` skips it |
| Dead tokens | A token Firebase reports as not registered is cleared at once |
| Failure | Never fails the caller. A push error is logged; the Inbox row stays |
| Config | `FIREBASE_SERVICE_ACCOUNT_JSON` (env, the whole service-account file on one line, never committed) and the setting `PUSH_ENABLED` (default on) |

A token belongs to one phone: registering a token that another account had moves it, so the old account stops receiving pushes on that phone.

Payload: `notification: { title, body }` and `data: { type, route, messageId, … }`, all strings. `type` names the event and `route` the screen a tap opens; the full list is in the mobile doc.

## Reminders

One interval job, `deadline-reminders`, runs every 5 minutes on each API server. It reads the deadlines from SystemConfig on every run, so changing a deadline moves the reminders with it.

**Stages fire once.** Each stage has a window (`at` to `until`). The first server to reach a stage claims it with an atomic upsert on `ReminderMark` (key `rem:<TYPE>:<period>:<AUDIENCE>:<stage>`, TTL 90 days), so several servers or a restart never send it twice. If the job was down and several stages are due at once, it sends only the latest and claims the earlier ones.

**Skip rules** (employee reminders): not active (never listed), not yet joined, blocked (their manager already hears about that), on approved leave, and, for the daily plan only, a weekly off or holiday. A closed financial year is skipped quietly. A plan counts as sent once it is submitted, manager-approved or approved; draft, rejected, withdrawn, reopened or missing counts as not sent.

**Managers** hear counts, not names: *"7 of 40 on your team (3 direct) haven't sent today's plan"*. The count covers the whole downline of active field employees who were asked (so someone on leave is not counted); "direct" says how many of them report straight to this manager. Approvals waiting are the manager's **direct** reports only (the ones they can act on).

| Reminder | Employee | Manager | Deadline (setting) | Who is "not done" |
|---|---|---|---|---|
| Daily plan | 2 h before, 30 min before, at the deadline ("missed") | 2 h before; 30 min after | `DAILY_PLAN_SUBMIT_CUTOFF_TIME` on the plan day | Plan status not submitted/approved |
| Monthly plan | 3 days, 1 day before; the morning after | same | `MONTHLY_PLAN_SUBMIT_CUTOFF_DATE` of the month before the plan month | Same |
| Expenses (send) | 3 days, 1 day before; the morning after | same | `EXPENSE_SUBMIT_CUTOFF_DAY` of the month after | Has expenses for the month, none sent (`listUnsubmittedExpenseUsers`) |
| Expenses (approve) | — | 3 days, 1 day before; the morning after | `EXPENSE_APPROVAL_CUTOFF_DAY` | Count of `EXPENSE_MONTH` waiting at the manager |
| Stock counts | 3 days, 1 day before; the morning after | — | `MONTHLY_STOCK_DEADLINE_DAY` | `sales.listMissingStock` (only people who cover distributors appear) |
| Approvals waiting | — | Twice a day, only when something waits | `REMINDER_DIGEST_MORNING_TIME`, `REMINDER_DIGEST_EVENING_TIME` | `approval.listWaitingOnManagers`, by kind |

Day-based reminders go out at the morning digest time (default 10:30), never at 23:59 on the deadline day. "The morning after" is the "missed" message. All lead times are settings (`REMINDER_*`, group *Notifications*); `REMINDERS_ENABLED` switches the whole engine off.

## Immediate messages

Announced on an in-process event bus (`shared/events/appEvents.ts`) after the work commits, and turned into Inbox messages by `pushEvents.ts` at the composition root. A listener that fails is logged and never fails the announcer.

| Event | Who is told | When |
|---|---|---|
| `approval.decided` (approved or rejected, any kind, also automatic) | The submitter, with the reason on a rejection | After the approval commits. Not when the actor is the submitter |
| `submit.exception.granted` (daily or monthly plan, expense month) | The employee, with the end time | After the exception is saved |
| `user.unblocked` | The employee | After the block is cleared |
| New leave / expense month / new doctor request, overdue request, someone blocked | The manager | Existing team alerts (every 5 min); they now push too |
| Admin broadcast | The audience | Existing Inbox send; pushes too |

## Not done

- Quiet hours (no pushes at night) and per-person switches for notification types.
- Late exceptions for *approving* (an expense-approval or leave exception) do not message anyone.
- A rejected-and-reopened expense month is not nagged separately before the cutoff.
- Names in the push text. The text shows counts; the phone opens the screen that lists names.
- iOS APNs setup, topics, and delivery receipts are the phone team's and Firebase's side.

## Tests

`modules/reminders/domain/stages.test.ts` (windows, catch-up), `modules/reminders/application/reminders.test.ts` (who is reminded, dedupe, skip rules, manager counts, digests, switches), `shared/push/pushNotifier.test.ts`, `pushEvents.test.ts`, `identity/.../pushToken.usecase.test.ts`.
