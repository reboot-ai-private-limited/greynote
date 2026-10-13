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
