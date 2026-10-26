'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAllFieldEmployees, useFieldDirectory } from '@/features/people/hooks/useUsers';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';

const ALL = 'ALL';
const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';

interface Row {
  id: string;
  name: string;
  employeeCode: string;
  hqId: string | null;
  zoneId: string | null;
}

/**
 * Tick any number of active field employees at once — any designation. Admin and HR can narrow the list by Zone and HQ (an employee's
 * own HQ), or to the HQs the record covers; the Accountant sees names and codes only, so only the search applies to them. The ticks start
 * from `chosen`, and "Done" hands back the whole new list.
 */
export function PeoplePickerDialog({
  chosen,
  coverageHqIds,
  onDone,
  onClose,
}: {
  chosen: string[];
  /** The HQs the record covers; when given, the list starts narrowed to people based in them. */
  coverageHqIds?: string[] | undefined;
  onDone: (userIds: string[]) => void;
  onClose: () => void;
}) {
  const { user: me } = useSession();
  const canFilter = me?.role !== 'ACCOUNTANT';
  const employees = useAllFieldEmployees(canFilter);
  const directory = useFieldDirectory(!canFilter);
  const zones = useAllZones();
  const hqs = useAllHqs();
  const [ticked, setTicked] = useState<string[]>(chosen);
  const [term, setTerm] = useState('');
  const [zoneId, setZoneId] = useState(ALL);
  const [hqId, setHqId] = useState(ALL);
  const [inCoverage, setInCoverage] = useState(Boolean(coverageHqIds && coverageHqIds.length > 0));

  const rows: Row[] = canFilter
    ? (employees.data ?? []).map((u) => ({ id: u.id, name: u.name, employeeCode: u.employeeCode, hqId: u.hqId, zoneId: u.zoneId }))
    : (directory.data ?? []).map((u) => ({ id: u.id, name: u.name, employeeCode: u.employeeCode, hqId: null, zoneId: null }));
  const query = canFilter ? employees : directory;

  const hqName = (id: string | null) => (hqs.data ?? []).find((q) => q.id === id)?.name ?? null;
  const hqOptions = (hqs.data ?? []).filter((q) => q.status === 'active' && (zoneId === ALL || q.zoneId === zoneId));
  const needle = term.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (u) =>
          (!needle || u.name.toLowerCase().includes(needle) || u.employeeCode.toLowerCase().includes(needle)) &&
          (zoneId === ALL || u.zoneId === zoneId) &&
          (hqId === ALL || u.hqId === hqId) &&
          (!inCoverage || !coverageHqIds || (u.hqId !== null && coverageHqIds.includes(u.hqId))),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.length, needle, zoneId, hqId, inCoverage, coverageHqIds, query.data],
  );
  const allShown = shown.length > 0 && shown.every((u) => ticked.includes(u.id));
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const toggleShown = () => {
    const ids = shown.map((u) => u.id);
    setTicked((t) => (allShown ? t.filter((id) => !ids.includes(id)) : [...new Set([...t, ...ids])]));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Assign people"
      description="Tick everyone who looks after this distributor, then press Done."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onDone(ticked)}>Done ({ticked.length})</Button>
        </>
      }
    >
      <label htmlFor="people-search" className="mb-1.5 block text-sm font-medium text-text">
        Search
      </label>
      <Input id="people-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name or employee code, e.g. Rahul or MR003" autoComplete="off" />
      {canFilter ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select
            aria-label="Zone"
            value={zoneId}
            onValueChange={(next) => {
              setZoneId(next);
              setHqId(ALL);
            }}
            options={[{ value: ALL, label: 'All zones' }, ...(zones.data ?? []).filter((z) => z.status === 'active').map((z) => ({ value: z.id, label: z.name }))]}
          />
          <Select aria-label="HQ" value={hqId} onValueChange={setHqId} options={[{ value: ALL, label: 'All HQs' }, ...hqOptions.map((q) => ({ value: q.id, label: q.name }))]} />
        </div>
      ) : null}
      {canFilter && coverageHqIds && coverageHqIds.length > 0 ? (
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className={checkbox} checked={inCoverage} onChange={(e) => setInCoverage(e.target.checked)} />
          Only people based in this distributor’s coverage
        </label>
      ) : null}
      <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm font-medium">
        <input type="checkbox" className={checkbox} checked={allShown} disabled={shown.length === 0} onChange={toggleShown} />
        Select all shown ({shown.length})
      </label>
      <div aria-live="polite" className="mt-2 max-h-64 overflow-y-auto">
        {query.isLoading ? (
          <p className="text-[13px] text-text-subtle">Loading…</p>
        ) : query.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">
            {toErrorState(query.error).message}
          </p>
        ) : shown.length === 0 ? (
          <p className="text-[13px] text-text-subtle">No active employees match.{inCoverage ? ' Untick “only people based in this coverage” to see everyone.' : ''}</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {shown.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input type="checkbox" className={checkbox} checked={ticked.includes(u.id)} aria-label={u.name} onChange={() => toggle(u.id)} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{u.name}</span>
                    <span className="block text-xs text-text-subtle">
                      {u.employeeCode}
                      {hqName(u.hqId) ? ` · ${hqName(u.hqId)}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
