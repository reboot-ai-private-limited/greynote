export const EMPLOYEE_CODE_PREFIX = 'GH';

/** The first number handed out: GH101. */
export const EMPLOYEE_CODE_FIRST = 101;

/** GH101, GH102 …, no padding; past 999 it simply grows (GH1000). */
export function formatEmployeeCode(sequence: number): string {
  return `${EMPLOYEE_CODE_PREFIX}${sequence}`;
}

/** The number in a GH code, or `null` for any other code (older GRN ones, hand-typed ones). */
export function parseEmployeeCode(code: string): number | null {
  const match = /^GH(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
}
