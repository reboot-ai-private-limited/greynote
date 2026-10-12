/**
 * The daily report — one row per user per `reportDate` that every record of the day attaches to
 * (ERD Module 4). It carries no status of its own: its approval is the `DCR` `ApprovalRequest`
 * whose `recordId` is this `id`, and no request yet means `DRAFT`. The envelope is created lazily by
 * the first record of the day (or by the submit), so an MR never "opens" a DCR as a separate step.
 */
export interface Dcr {
  id: string;
  userId: string;
  /** A calendar day, `YYYY-MM-DD` — not an instant. */
  reportDate: string;
  /** The day's note, set at submit: required on a meeting or conference day (agenda, venue), optional otherwise. `null` before submit. */
  remarks: string | null;
  createdAt: Date;
}
