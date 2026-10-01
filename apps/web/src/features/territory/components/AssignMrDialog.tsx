'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useFieldEmployees } from '../hooks/useFieldEmployees';
import { useAssignMr } from '../hooks/useRouteMutations';

/** Search FIELD employees and assign one. Already-assigned and inactive employees are not offered. */
export function AssignMrDialog({
  routeId,
  assignedUserIds,
  onClose,
}: {
  routeId: string;
  assignedUserIds: ReadonlySet<string>;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const employees = useFieldEmployees(term, true);
  const assign = useAssignMr(routeId, onClose);
  const candidates = (employees.data?.items ?? []).filter((u) => u.status !== 'inactive' && !assignedUserIds.has(u.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title="Assign an MR" description="Search by name or employee code.">
      <label htmlFor="mr-search" className="mb-1.5 block text-sm font-medium text-text">
        Employee
      </label>
      <Input id="mr-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Anita or MR014" autoComplete="off" />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {employees.isLoading ? (
          <p className="text-[13px] text-text-subtle">Searching…</p>
        ) : employees.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">{toErrorState(employees.error).message}</p>
        ) : candidates.length === 0 ? (
          <p className="text-[13px] text-text-subtle">No available MRs match.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {candidates.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">{u.name}</p>
                  <p className="text-xs text-text-subtle">{u.employeeCode}</p>
                </div>
                <Button size="sm" disabled={assign.isPending} onClick={() => assign.mutate(u.id)}>
                  Assign
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
