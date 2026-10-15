export const EMPLOYEE_CODE_PREFIX = 'GHC';

/** The first number handed out: GHC001. */
export const EMPLOYEE_CODE_FIRST = 1;

/** GHC001, GHC002 …, padded to three digits; past 999 it simply grows (GHC1000). */
export function formatEmployeeCode(sequence: number): string {
  return `${EMPLOYEE_CODE_PREFIX}${String(sequence).padStart(3, '0')}`;
}

/** The number in a GHC code, or `null` for any other code (older GRN / GH ones, hand-typed ones). */
export function parseEmployeeCode(code: string): number | null {
  const match = /^GHC(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
}
