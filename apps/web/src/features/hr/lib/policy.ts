import type { LeavePolicyDto, LeaveTypeDto } from '@greynote/contracts';
import { daysError, parseDays } from './days';
import { paidTypes } from './leaveTypes';

export interface PolicyCell {
  payBandId: string;
  leaveTypeId: string;
  /** The default set for this grade and type, or `null` when none has been (a seeded balance is then 0 days). */
  days: number | null;
}

export interface PolicyGrid {
  columns: { id: string; name: string }[];
  rows: { payBandId: string; name: string; cells: PolicyCell[] }[];
}

/** One row per grade, one column per active paid type, each cell the days set (or none yet). */
export function buildPolicyGrid(
  bands: readonly { id: string; name: string }[],
  types: readonly LeaveTypeDto[],
  policies: readonly Pick<LeavePolicyDto, 'payBandId' | 'leaveTypeId' | 'defaultDays'>[],
): PolicyGrid {
  const columns = paidTypes(types).map((t) => ({ id: t.id, name: t.name }));
  const set = new Map(policies.map((p) => [`${p.payBandId}:${p.leaveTypeId}`, p.defaultDays]));
  return {
    columns,
    rows: [...bands]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((band) => ({
        payBandId: band.id,
        name: band.name,
        cells: columns.map((c) => ({ payBandId: band.id, leaveTypeId: c.id, days: set.get(`${band.id}:${c.id}`) ?? null })),
      })),
  };
}

export type CellEdit = { ok: true; days: number | null } | { ok: false; error: string };

/**
 * What an edit of one cell means. Unchanged (or still blank where nothing was set) is `days: null`, so nothing is sent;
 * a blank where a number was set is refused, since the API can set a default but not unset one.
 */
export function readCell(raw: string, current: number | null): CellEdit {
  const t = raw.trim();
  if (t === '') return current === null ? { ok: true, days: null } : { ok: false, error: 'Enter a number of days (0 for none).' };
  const problem = daysError(t);
  if (problem) return { ok: false, error: problem };
  const days = parseDays(t) as number;
  return { ok: true, days: days === current ? null : days };
}

export const POLICY_NOTE =
  'A change applies to balances created from now on. Balances already created for a year keep their days; adjust those on the employee.';

export const cellKey = (payBandId: string, leaveTypeId: string) => `${payBandId}:${leaveTypeId}`;

export interface PolicyChange {
  payBandId: string;
  leaveTypeId: string;
  days: number;
}

/**
 * Turns the grid's typed values into what to send: only the cells that changed, and an error per cell that is invalid. `drafts`
 * holds a string for each cell the person touched; a cell not in it is unchanged.
 */
export function collectPolicyChanges(
  grid: PolicyGrid,
  drafts: Readonly<Record<string, string>>,
): { changes: PolicyChange[]; errors: Record<string, string> } {
  const changes: PolicyChange[] = [];
  const errors: Record<string, string> = {};
  for (const row of grid.rows) {
    for (const cell of row.cells) {
      const key = cellKey(cell.payBandId, cell.leaveTypeId);
      if (!(key in drafts)) continue;
      const edit = readCell(drafts[key] ?? '', cell.days);
      if (!edit.ok) errors[key] = edit.error;
      else if (edit.days !== null) changes.push({ payBandId: cell.payBandId, leaveTypeId: cell.leaveTypeId, days: edit.days });
    }
  }
  return { changes, errors };
}

export interface PolicySaveResult {
  saved: PolicyChange[];
  failed: { change: PolicyChange; message: string }[];
}

/** Sends each change on its own. One refused cell never undoes the others, and each failure keeps the server's message. */
export async function savePolicyChanges(
  send: (change: PolicyChange) => Promise<unknown>,
  changes: readonly PolicyChange[],
): Promise<PolicySaveResult> {
  const result: PolicySaveResult = { saved: [], failed: [] };
  for (const change of changes) {
    try {
      await send(change);
      result.saved.push(change);
    } catch (error) {
      result.failed.push({ change, message: error instanceof Error ? error.message : 'Could not save.' });
    }
  }
  return result;
}
