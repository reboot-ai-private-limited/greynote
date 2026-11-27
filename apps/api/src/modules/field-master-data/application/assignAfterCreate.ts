/** Assigns a record just added by office staff to the MR they picked (2026-11-27). */
export type AssignNew = (recordId: string, userId: string, adminId: string) => Promise<unknown>;

/**
 * The record is kept even when the assignment is refused (e.g. the MR is not based in the HQ of its place, or is a manager): the answer
 * says why in `assignError`, and Admin can assign it later on its Assignments tab.
 */
export async function assignAfterCreate(assign: AssignNew | undefined, recordId: string, userId: string | null | undefined, adminId: string): Promise<string | null> {
  if (!assign || !userId) return null;
  try {
    await assign(recordId, userId, adminId);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : 'It could not be assigned.';
  }
}
