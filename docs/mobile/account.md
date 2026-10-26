# Mobile — Delete my account

Plan date 2026-10-13. Status key: ✅ exists, 📱 the phone shows it. Required by Google Play: the app must offer account deletion. Related: [`utility.md`](utility.md), decision-log 2026-10-13.

## Route

| Route | What it does |
|---|---|
| ✅ `POST /api/identity/auth/delete-account` body `{ "password": "…" }` | Deletes the signed-in employee's account. `200` on success: the phone must clear its tokens and return to the sign-in screen. |

Errors: `403` the password is wrong (the account is untouched); `409` with `data.reason = "HAS_ACTIVE_REPORTS"` a manager whose team is still active (tell them to ask their own manager or HR to move the team first); `409` already deleted; `400` not a field account.

## What the employee should be told (📱 confirm screen)

- Your name, phone, email, personal and bank details and uploaded documents are removed, and you can no longer sign in. This cannot be undone.
- Payroll, visit, order and expense records are kept without your personal details, because the company must keep them for tax and audit.
- You can also ask HR to delete the account on your behalf.

## Screen

Profile → **Delete account** → confirm text above → password field → red **Delete my account** button. Needs a network connection (no offline queue). The route also works while a past financial year is being viewed.

## Change my password (2026-10-26)

Any signed-in employee can change their own password. Admin still resets other people's. A forgotten password still goes to Admin. Related: decision-log 2026-10-26.

| Route | What it does |
|---|---|
| ✅ `POST /api/identity/auth/change-password` body `{ "currentPassword": "…", "newPassword": "…", "refreshToken": "…" }` | Changes the signed-in employee's password. `200` on success. |

Send the phone's current `refreshToken` in the body (as `logout` does). It tells the server which session to keep: **this phone stays signed in; every other session of the employee is signed out** (`PASSWORD_RESET`), on the web and on their other phone. Without it, every session ends, this phone included, and the app must then show the sign-in screen. Registered phones stay registered.

Errors: `403` the current password is wrong (nothing changed); `400` the new password is the same as the current one, shorter than 8 characters or longer than 72 bytes; `429` five wrong current passwords in 15 minutes (`data.reason = "RATE_LIMITED"`; wait). Show the server's message.

**Screen (📱):** Profile → **Change password** → Current password, New password, Confirm new password; each box has an eye icon that shows or hides what was typed. Check on the phone that New and Confirm match and New is at least 8 characters before sending. Save → toast "Password changed". Needs a network connection (no offline queue). The route also works while a past financial year is being viewed.

## Public deletion page (Google Play URL)

`https://www.greynotehealth.com/delete-account` — a form on the company website: employee code + password, then the same deletion via `POST /api/identity/auth/delete-account-public` (no sign-in). The website origin must be in the API's `CORS_ORIGINS`. Five tries per 15 minutes per address and per code (`429`). Field accounts only; a deleted account can no longer sign in to the app.

## When Admin deactivates an employee (2026-10-22)

Deactivation is done by Admin on the web (nothing in the app). What the phone sees (docs only; the app is another team's):

- **At once:** the next request with the current access token gets `401` (it no longer waits for the token to expire), and refreshing the session
  gets `401` "This account has been deactivated". Treat it like any signed-out state: clear the session and show the login screen.
- **Login** is refused with `403` "This account has been deactivated". Show the message; don't retry.
- **Records still queued on the phone** stay saved there, unsent: a signed-out phone doesn't sync. They go up only if the account is
  reactivated and the same person signs in on that phone, and then only if they are not older than `SYNC_MAX_AGE_DAYS` (7). Nothing to do.
- Optional: when the app signs someone out because the refresh was refused, say so ("You've been signed out") instead of only showing Login;
  they see "This account has been deactivated" when they try to sign in.
- If Admin later **reactivates** the account (a rehire), login works again. Deactivation ends the sessions but leaves the phones registered, so a phone they used before signs in without a new approval.
