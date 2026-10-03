'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useManagerCandidates } from '../hooks/useUsers';

/** Search active field employees and choose one as the manager. The employee themselves is not offered. */
export function ManagerPickerDialog({
  selfId,
  onPick,
  onClose,
}: {
  selfId: string;
  onPick: (user: { id: string; name: string }) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const candidates = useManagerCandidates(term, true);
  const rows = (candidates.data?.items ?? []).filter((u) => u.id !== selfId);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Choose a manager" description="Search by name or employee code.">
      <label htmlFor="manager-search" className="mb-1.5 block text-sm font-medium text-text">
        Manager
      </label>
      <Input id="manager-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Rahul or ASM003" autoComplete="off" />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {candidates.isLoading ? (
          <p className="text-[13px] text-text-subtle">Searching…</p>
        ) : candidates.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">{toErrorState(candidates.error).message}</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-text-subtle">No active employees match.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{u.name}</p>
                  <p className="text-xs text-text-subtle">{u.employeeCode}</p>
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
