# LLD: Documents

The files an Admin shares with employees, shown in the phone app's **Docs** tab next to the employee's own payslips. Tier 3 module `documents`; entity in [`../erd/11-documents.md`](../erd/11-documents.md). The phone side is [`../mobile/docs.md`](../mobile/docs.md).

## Public contract

None. Nothing imports from this module. It needs Identity's `listActiveRecipients()` (to check the people named are active field employees), passed in by the composition root.

## Rules

- A document has a title, a category (`POLICY`, `CIRCULAR`, `FORM`, `OTHER`), one file (PDF, JPG or PNG, up to 10 MB, the type read from the file's own bytes) and an audience: **everyone** (no people named) or **the named active field employees**.
- The file is stored in Cloudinary (`greynote/library`); removing a document deletes the file too. A failed save after the upload removes the uploaded file.
- Every document in the API carries `url` (open) and `downloadUrl` (2026-10-22: the same file with Cloudinary's `fl_attachment`, saved under the document's title), so the phone can offer Download on every document.
- A document is **not tied to a financial year**: it is the same whichever year is being looked at.
- The audience is fixed when the document is added. To change it, remove and add again.

## HTTP surface

| Method | Path | Who | Purpose |
|---|---|---|---|
| `GET` | `/api/documents` | Admin, Field | Admin: the whole library with each audience. Field: what is for everyone or names them; no audience shown. Newest first, at most 500. |
| `POST` | `/api/documents` | Admin | Multipart: `file`, `title`, `category`, optional `userIds` (JSON array or comma list). |
| `DELETE` | `/api/documents/:id` | Admin | Removes the row and the file. |

## Payslips (Payroll)

The employee's own payslips are Payroll's: `GET /api/payroll/me?fromMonth&toMonth` (`FIELD`) returns the caller's **finalized** runs for the financial year in view, each with the slip drawn by `payslipOf` (now in `packages/contracts`, shared by the portal, the API and the phone). Drafts are never returned; the caller cannot name another user.
