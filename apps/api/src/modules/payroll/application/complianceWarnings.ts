import type { Paise } from '@/shared/money/paise.js';

export interface WarningRow {
  userId: string;
  /** The monthly gross of the run. */
  baseSalaryPaise: Paise;
  esiNumber: string | null;
  epfNumber: string | null;
}

/**
 * Who is missing a statutory number, as a warning only (nothing is refused). ESI covers monthly gross **at or below** the ceiling, so a
 * person at exactly the ceiling is still covered; EPF is expected for everyone. A person with neither number is in both lists.
 */
export function complianceWarnings(rows: readonly WarningRow[], esiCeilingPaise: Paise): { esiMissing: string[]; epfMissing: string[] } {
  return {
    esiMissing: rows.filter((r) => !r.esiNumber && r.baseSalaryPaise <= esiCeilingPaise).map((r) => r.userId),
    epfMissing: rows.filter((r) => !r.epfNumber).map((r) => r.userId),
  };
}
