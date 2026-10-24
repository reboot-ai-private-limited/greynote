import { formatAdminCode, formatEmployeeCode, parseAdminCode, parseEmployeeCode } from '../modules/identity/domain/employeeCode.js';

export interface CodeRow {
  id: string;
  employeeCode: string;
  dateOfJoining: Date | null;
  createdAt: Date | null;
}

export interface CodeChange {
  id: string;
  from: string;
  to: string;
}

const time = (d: Date | null): number => (d ? d.getTime() : Number.POSITIVE_INFINITY);

/**
 * Everyone not already on a GHC code gets the next numbers after the highest GHC code in use, oldest joiner first
 * (no joining date: by creation time, then by id). A user already on a GHC code keeps it, so a second run changes
 * nothing, and no new code can equal an old one, so the unique index never trips mid-way.
 */
export function planEmployeeCodes(rows: CodeRow[]): { changes: CodeChange[]; lastSequence: number } {
  let highest = 0;
  for (const row of rows) highest = Math.max(highest, parseEmployeeCode(row.employeeCode) ?? 0);
  const pending = rows
    // An Admin's ADMIN01-style code is its own series: leave it be.
    .filter((row) => parseEmployeeCode(row.employeeCode) === null && parseAdminCode(row.employeeCode) === null)
    .sort((a, b) => time(a.dateOfJoining) - time(b.dateOfJoining) || time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));
  const changes = pending.map((row, i) => ({ id: row.id, from: row.employeeCode, to: formatEmployeeCode(highest + i + 1) }));
  return { changes, lastSequence: highest + changes.length };
}

/**
 * Every Admin moves to ADMIN01, ADMIN02 … oldest first (by creation time, then id). An Admin already on an ADMIN code keeps it, so a
 * second run changes nothing and a new number never equals one in use.
 */
export function planAdminCodes(rows: Array<{ id: string; employeeCode: string; createdAt: Date | null }>): { changes: CodeChange[]; lastSequence: number } {
  let highest = 0;
  for (const row of rows) highest = Math.max(highest, parseAdminCode(row.employeeCode) ?? 0);
  const changes = rows
    .filter((row) => parseAdminCode(row.employeeCode) === null)
    .sort((a, b) => time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id))
    .map((row, i) => ({ id: row.id, from: row.employeeCode, to: formatAdminCode(highest + i + 1) }));
  return { changes, lastSequence: highest + changes.length };
}
