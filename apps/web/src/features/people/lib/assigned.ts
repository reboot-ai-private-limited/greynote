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

type Kind = 'doctors' | 'chemists' | 'distributors';
const KIND_WORD: Record<Kind, string> = { doctors: 'doctor', chemists: 'chemist', distributors: 'distributor' };

/** One line of the review step: what assigning this record does to who holds it now. A doctor has one holder and is moved; the others add to the holders. */
export function reviewNote(kind: Kind, holders: Holder[], employeeId: string): { text: string; tone: 'free' | 'moves' | 'adds' | 'already' } {
  if (holders.some((h) => h.userId === employeeId)) return { text: 'Already held by this employee', tone: 'already' };
  if (holders.length === 0) return { text: 'Free: nobody holds it now', tone: 'free' };
  const names = holders.map((h) => h.name).join(', ');
  return kind === 'doctors' ? { text: `Moves from ${names}`, tone: 'moves' } : { text: `Adds to ${names}, who keep it`, tone: 'adds' };
}

/** The sentence after a bulk assign: how many were assigned, removed, already held or skipped. */
export function resultSummary(kind: Kind, results: { outcome: 'ASSIGNED' | 'MOVED' | 'ALREADY' | 'REMOVED' | 'SKIPPED' }[]): string {
  const count = (...o: string[]) => results.filter((r) => o.includes(r.outcome)).length;
  const word = (n: number) => `${n} ${KIND_WORD[kind]}${n === 1 ? '' : 's'}`;
  const parts = [
    count('ASSIGNED', 'MOVED') ? `${word(count('ASSIGNED', 'MOVED'))} assigned` : null,
    count('REMOVED') ? `${word(count('REMOVED'))} removed` : null,
    count('ALREADY') ? `${count('ALREADY')} already held` : null,
    count('SKIPPED') ? `${count('SKIPPED')} skipped` : null,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(', ')}.` : 'Nothing changed.';
}

/** What taking this record off the employee does: a doctor is left with nobody; for a chemist or distributor the others who hold it keep it. */
export function removeNote(kind: Kind, holders: Holder[], employeeId: string): string {
  const others = holders.filter((h) => h.userId !== employeeId);
  if (kind === 'doctors') return 'Nobody will hold it until it is assigned again';
  return others.length > 0 ? `${others.map((h) => h.name).join(', ')} keep${others.length === 1 ? 's' : ''} it` : 'Nobody will hold it';
}
