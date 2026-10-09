export const EMPLOYEE_CODE_PREFIX = 'GRN';

/** GRN0001, GRN0002 … ; past 9999 it simply grows (GRN10000). */
export function formatEmployeeCode(sequence: number): string {
  return `${EMPLOYEE_CODE_PREFIX}${String(sequence).padStart(4, '0')}`;
}

/** The number in a GRN code, or `null` for any other code (older, hand-typed ones). */
export function parseEmployeeCode(code: string): number | null {
  const match = /^GRN(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
}
