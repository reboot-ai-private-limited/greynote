# Mobile: what the field app is missing (checked 2026-10-28)

The field app (`apps/fieldApp`, another team's) last had real feature work on **2026-10-24** (`b823752`, targets view-only and CSV downloads). `91cc1e2` on 2026-10-25 only touched three amend screens (reason became optional). Since then the server, web and `docs/mobile` moved on by 47 commits. This is the list of what the phone has not caught up with, and what we want added.

**Progress 2026-10-28 (typechecked and linted, not yet run on a phone):** A1, A2 (message and queued-refusal handling; the button hides once the setting reaches the phone), B1, B2, B3 (own downloads leave the designation out, see below), B4 and D are built. B5 and B6 needed no change. Still open: section C (server), and the phone has no way to read its own designation for the CSV file name.

## A. Must change: the phone is now wrong

| # | Gap | Where | Why |
|---|---|---|---|
| A1 | **Remove the Done button on distributor orders.** `orders.tsx` still lets the MR mark Done; the server now answers `403`. | `orders-and-stock.md` rule 8, "Invoices" | 2026-10-27: only Admin / Accountant mark Done, with an invoice number. The MR can only cancel. |
| A2 | **Add Doctor must respect "Managers can add doctors".** The Add Doctor tile shows for everyone; for a manager with the setting off the add fails with `403`, and a queued `NEW_DOCTOR` comes back `MANAGER_NOT_ALLOWED`. | `doctors.md` rule 1 | 2026-10-28. Needs the phone to read the setting (see section C) and to show a clear message on `MANAGER_NOT_ALLOWED`. |

## B. New things the server already has

| # | Gap | Where |
|---|---|---|
| B1 | **Change password** screen (Profile → Change password; send the current `refreshToken`; this phone stays signed in). Not in the app at all. | `account.md` |
| B2 | **Names on "Works with"** in the request-summary screen: print `workWithPeople[].label` ("Asha Rao (ASM)") instead of "N colleague(s)". Also on plan reads and `GET /team/plans`. | `monthlyplan.md`, `team.md` |
| B3 | **CSV file names** of Tour Plan and Expenses downloads: `<name>-<designation>-<kind>-<YYYY-MM>-<code>.csv`, using the employee the file belongs to. | `monthlyplan.md` rule 22, `expenses.md` rule 11 |
| B4 | **Order lines:** the same product can now sit on several lines of one order at different prices or discounts. Check the order screens show each line and do not merge them. | `orders-and-stock.md` "One product on several lines" |
| B5 | **Order price is the server's.** The phone's unit price is only a preview (PTS for a distributor, PTR for a chemist); show the server's total after sync. | `orders-and-stock.md` rules 1 and 5 |
| B7 | **Weekly offs are a schedule now (2026-10-28).** The Holidays screen says "Weekly off: every X" from `weeklyOffDay` and the client-side fallbacks (`weeklyOffIndex`, the legacy check in `monthly-plan.tsx` when `planOffDays` is missing) only know one weekday. Read `hr.weeklyOffSchedule` instead and show the 1st/3rd Saturday. Plan locking is already right: it comes from `planOffDays`. | `holidays.md` rule 3 and section 3 |
| B6 | Admin / HR can edit an **approved** month's later days and Admin can delete a future month. Web-only for now; the phone only needs to cope with the plan changing under it (the employee gets the `PLAN_AMENDED_MONTHLY_PLAN` push). | `monthlyplan.md` rules 20, 21 |

## C. Needs a server change first

- **Expose `MANAGER_CAN_ADD_DOCTORS` to the phone.** The app cannot hide the button because nothing it reads carries the flag. Put it in `GET /config/public` or the sync snapshot.
  **Server done 2026-10-31:** `GET /config/public` now returns `managerCanAddDoctors` and `managerCanAddChemists` (booleans). The phone still reads `config.settings.MANAGER_CAN_ADD_DOCTORS` from the snapshot, which the server does not send; switch it to the public config (`apps/fieldApp/src/lib/manager-add-doctors.ts`).

## E. New: add a Chemist (2026-10-31)

The server lets an employee add a chemist with the phone's location, like a doctor. The phone has nothing for it yet. Build it from [`chemists.md`](chemists.md): an "Add chemist" action, "My added chemists" with approval status, and a `NEW_CHEMIST` queued record. Hide it for managers unless `managerCanAddChemists` is true.

## D. Requested: Doctors in the app

Today "Add Doctor" is a tile on Home, "My added doctors" and the doctor list live inside other screens, and a manager sees a doctor only through "Visit targets" (`team-doctors`). Wanted:

1. **Rename the tile to "Doctors"** and open a list of **every doctor assigned to me** (`GET /field-master-data/doctors/mine`), with photo or initials, clinic, phone, visit frequency, and pending / rejected ones I added (`/doctors/added`) marked with their status.
2. **"+ Add doctor" button on that list.** Shown to MRs; for a manager only while *Managers can add doctors* is on.
3. **Managers see their own assigned doctors** in the same list, read-only unless the setting is on.
4. **Team → People → an employee → Doctors:** that employee's doctors (`GET /field-master-data/doctors/team?userId`). The app already has this behind "Doctor visit targets"; make it a plain list first, with the visit target as an action on a doctor.
5. Keep working offline from the snapshot's `doctors` and `pendingDoctors`.

## Not a phone job

Invoices, Tax Invoice printing, payments allocated to invoices, HSN/SAC, batch and expiry, office-split order lines, HR setting targets, and the Admin pages are web and server only.
