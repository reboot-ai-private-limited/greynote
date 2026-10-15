import { formatEmployeeCode, parseEmployeeCode } from '../modules/identity/domain/employeeCode.js';

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
    .filter((row) => parseEmployeeCode(row.employeeCode) === null)
    .sort((a, b) => time(a.dateOfJoining) - time(b.dateOfJoining) || time(a.createdAt) - time(b.createdAt) || a.id.localeCompare(b.id));
  const changes = pending.map((row, i) => ({ id: row.id, from: row.employeeCode, to: formatEmployeeCode(highest + i + 1) }));
  return { changes, lastSequence: highest + changes.length };
}
