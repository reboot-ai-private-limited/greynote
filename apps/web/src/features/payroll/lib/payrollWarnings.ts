import type { PayrollWarningsDto } from '@greynote/contracts';

export type MissingKind = 'esi' | 'epf';

export interface WarningLink {
  key: MissingKind;
  text: string;
  /** The Employees list narrowed to exactly these people. */
  href: string;
}

const plural = (n: number) => (n === 1 ? 'employee' : 'employees');

/** The Employees list for the people a warning names: `ids` narrows the list, `missing` says why, for the chip. */
export function employeesHref(kind: MissingKind, userIds: readonly string[]): string {
  return `/employees?ids=${userIds.join(',')}&missing=${kind}`;
}

/** One line per kind of missing number; nothing to warn about means no lines. */
export function warningLinks(w: PayrollWarningsDto | undefined): WarningLink[] {
  if (!w) return [];
  const out: WarningLink[] = [];
  if (w.esiMissing.length > 0) {
    const n = w.esiMissing.length;
    out.push({
      key: 'esi',
      text: `${n} ${plural(n)} with a salary of ₹${w.esiCeilingRupees.toLocaleString('en-IN')} or less ${n === 1 ? "doesn't" : "don't"} have an ESI number`,
      href: employeesHref('esi', w.esiMissing.map((p) => p.userId)),
    });
  }
  if (w.epfMissing.length > 0) {
    const n = w.epfMissing.length;
    out.push({
      key: 'epf',
      text: `${n} ${plural(n)} ${n === 1 ? "doesn't" : "don't"} have an EPF number`,
      href: employeesHref('epf', w.epfMissing.map((p) => p.userId)),
    });
  }
  return out;
}

/** The chip on the Employees list while it is narrowed by a warning link; '' for anything else. */
export function missingChipLabel(missing: string, count: number): string {
  if (missing === 'esi') return `Missing ESI number · ${count}`;
  if (missing === 'epf') return `Missing EPF number · ${count}`;
  return '';
}
