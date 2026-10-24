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

export const ADMIN_CODE_PREFIX = 'ADMIN';

/** ADMIN01, ADMIN02 …, padded to two digits; past 99 it simply grows (ADMIN100). Admins count on their own, apart from GHC. */
export function formatAdminCode(sequence: number): string {
  return `${ADMIN_CODE_PREFIX}${String(sequence).padStart(2, '0')}`;
}

/** The number in an ADMIN code, or `null` for any other code. */
export function parseAdminCode(code: string): number | null {
  const match = /^ADMIN(\d+)$/.exec(code);
  return match ? Number(match[1]) : null;
}
