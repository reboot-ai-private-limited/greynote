'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { useManagerCandidatesAbove } from '@/features/territory/hooks/useManagerCoverage';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { timing } from '@/lib/hooks/timing';
import { useFieldDirectory, useManagerCandidates } from '../hooks/useUsers';

/**
 * Search active field employees and choose one. For a manager, the employee themselves is not
 * offered (`selfId`); other screens reuse it to pick an MR or an ASM with their own `title`.
 *
 * With `above` it is the reporting-manager picker: only designations above `level` are offered (any higher level, so a vacant one can be
 * skipped), those covering `hqId` first, each with its designation in brackets.
 */
export function ManagerPickerDialog({
  selfId,
  title = 'Choose a manager',
  label = 'Manager',
  above,
  onPick,
  onClose,
}: {
  selfId?: string;
  title?: string;
  label?: string;
  above?: { level: number; hqId?: string | undefined };
  onPick: (user: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const { user: me } = useSession();
  // The Accountant picks from the names-only directory and searches it here; Admin and HR search the employee list.
  const viaDirectory = me?.role === 'ACCOUNTANT';
  const search = useDebouncedValue(term.trim(), timing.searchDebounceMs);
  const scoped = useManagerCandidatesAbove({ level: above?.level ?? 1, hqId: above?.hqId, search, excludeUserId: selfId }, Boolean(above));
  const listed = useManagerCandidates(term, !above && !viaDirectory);
  const directory = useFieldDirectory(!above && viaDirectory);
  const candidates = above ? scoped : viaDirectory ? directory : listed;
  const needle = term.trim().toLowerCase();
  const found: Array<{ id: string; name: string; employeeCode: string; designation?: string | null | undefined; noCoverage?: boolean | undefined }> = above
    ? (scoped.data ?? []).map((c) => ({ id: c.id, name: c.name, employeeCode: c.employeeCode, designation: c.designation.name, noCoverage: c.coverage === 'none' }))
    : viaDirectory
      ? (directory.data ?? []).filter((u) => !needle || u.name.toLowerCase().includes(needle) || u.employeeCode.toLowerCase().includes(needle))
      : (listed.data?.items ?? []);
  const rows = found.filter((u) => u.id !== selfId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={title} description="Search by name or employee code.">
      <label htmlFor="manager-search" className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <Input id="manager-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Rahul or ASM003" autoComplete="off" />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {candidates.isLoading ? (
          <p className="text-[13px] text-text-subtle">Searching…</p>
        ) : candidates.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">{toErrorState(candidates.error).message}</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-text-subtle">
            {above ? 'No manager above this designation covers this HQ. You can leave the manager empty: approvals then go straight to Admin or HR.' : 'No active employees match.'}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {u.name}
                    {u.designation ? <span className="font-normal text-text-muted"> ({u.designation})</span> : null}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {u.employeeCode}
                    {u.noCoverage ? ' · no coverage set' : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => onPick({ id: u.id, name: u.name })}>
                  Choose
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
