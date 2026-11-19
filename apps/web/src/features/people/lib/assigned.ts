export interface Holder {
  userId: string;
  name: string;
  employeeCode: string;
}

/** "+2 more" under the first few rows; `null` when everything is shown. */
export const moreText = (total: number, shown: number): string | null => (total > shown ? `+${total - shown} more` : null);

/**
 * What Remove says on an employee's page (decision-log 2026-11-19). Assignments belong to whoever holds the record, so removing from a manager's page
 * takes it off that holder, and it leaves the manager's list with it.
 */
export function removeWording(record: string, holder: Holder, viewing: { id: string; name: string }): { title: string; description: string } {
  const own = holder.userId === viewing.id;
  return {
    title: own ? `Remove ${record} from ${viewing.name}` : `Remove ${record} from ${holder.name}`,
    description: own
      ? `${viewing.name} will no longer hold ${record}. Nobody else changes.`
      : `${record} is held by ${holder.name} (${holder.employeeCode}), who is below ${viewing.name}. Removing takes it off ${holder.name}, and it leaves ${viewing.name}'s list too. Visits already logged are unchanged.`,
  };
}
