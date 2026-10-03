import type { SampleAllocationDto } from '@greynote/contracts';

/** The API's ceiling on one quantity. */
export const MAX_QUANTITY = 100_000;

/** What the field side has already drawn down: it can never be allocated below this. */
export function givenOut(a: Pick<SampleAllocationDto, 'quantityAllocated' | 'quantityRemaining'>): number {
  return a.quantityAllocated - a.quantityRemaining;
}

const WHOLE = /^\d+$/;

/** A quantity to add: a whole number from 1 to 100,000. */
export function issueQuantityError(raw: string): string | undefined {
  const t = raw.trim();
  if (t === '') return 'Enter a quantity.';
  if (!WHOLE.test(t)) return 'Use a whole number.';
  const n = Number(t);
  if (n < 1) return 'Issue at least 1.';
  if (n > MAX_QUANTITY) return `Issue at most ${MAX_QUANTITY.toLocaleString('en-IN')} at a time.`;
  return undefined;
}

/** The new allocated total: whole, within the ceiling, and not below what has been given out. */
export function adjustTotalError(raw: string, given: number): string | undefined {
  const t = raw.trim();
  if (t === '') return 'Enter a total.';
  if (!WHOLE.test(t)) return 'Use a whole number.';
  const n = Number(t);
  if (n > MAX_QUANTITY) return `The total is at most ${MAX_QUANTITY.toLocaleString('en-IN')}.`;
  if (n < given) return `${given.toLocaleString('en-IN')} have already been given out, so the total cannot be lower.`;
  return undefined;
}

/** What an issue does to an allocation, said before it happens: it adds, it does not replace. */
export function issuePreview(existing: Pick<SampleAllocationDto, 'quantityAllocated' | 'quantityRemaining'> | undefined, quantity: number): string {
  if (!existing) return `${quantity.toLocaleString('en-IN')} will be allocated.`;
  return `Adds ${quantity.toLocaleString('en-IN')} to the ${existing.quantityAllocated.toLocaleString('en-IN')} already allocated, making ${(existing.quantityAllocated + quantity).toLocaleString('en-IN')}.`;
}

/** Candidate MRs for a Doctor: those covering its Route now, who are not already the responsible one. */
export function assignableMrs<T extends { status: 'active' | 'inactive'; userId: string; user: { id: string; name: string; employeeCode: string } | null }>(
  routeAssignments: readonly T[],
  currentUserId: string | null | undefined,
): { userId: string; name: string; employeeCode: string }[] {
  const seen = new Set<string>();
  const out: { userId: string; name: string; employeeCode: string }[] = [];
  for (const a of routeAssignments) {
    if (a.status !== 'active' || !a.user || a.userId === currentUserId || seen.has(a.userId)) continue;
    seen.add(a.userId);
    out.push({ userId: a.userId, name: a.user.name, employeeCode: a.user.employeeCode });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
