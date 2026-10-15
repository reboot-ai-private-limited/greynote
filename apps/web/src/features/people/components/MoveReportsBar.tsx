'use client';

import type { ReassignProblemDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/ApiError';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useReassignManager } from '../hooks/useUsers';
import { ManagerPickerDialog } from './ManagerPickerDialog';

export interface Selected {
  id: string;
  name: string;
}

/** The problems a refused move carries: one line per person it could not move. */
function problemsOf(error: unknown): ReassignProblemDto[] {
  if (!(error instanceof ApiError)) return [];
  const data = error.data as { problems?: ReassignProblemDto[] } | null | undefined;
  return data?.problems ?? [];
}

/**
 * The bar that appears once people are ticked: choose the new manager, see who moves, confirm. The server checks everyone first, so a
 * refusal moves no one and is listed here by name.
 */
export function MoveReportsBar({
  selected,
  onClear,
}: {
  selected: readonly Selected[];
  onClear: () => void;
}) {
  const readOnly = useIsReadOnly();
  const [picking, setPicking] = useState(false);
  const [target, setTarget] = useState<Selected | null>(null);
  const [problems, setProblems] = useState<ReassignProblemDto[]>([]);
  const move = useReassignManager((result) => {
    toast.success(
      `Moved ${result.moved.length} ${result.moved.length === 1 ? 'person' : 'people'}${result.unchanged.length > 0 ? `, ${result.unchanged.length} already there` : ''}.`,
    );
    setTarget(null);
    onClear();
  });

  if (readOnly || selected.length === 0) return null;

  const confirm = () => {
    if (!target) return;
    setProblems([]);
    move.mutate(
      { userIds: selected.map((s) => s.id), managerId: target.id },
      { onError: (error) => setProblems(problemsOf(error)) },
    );
  };

  return (
    <>
      <div className="sticky bottom-4 z-10 mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-pop">
        <span className="text-sm text-text">{selected.length} selected</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClear}>
            Clear
          </Button>
          <Button onClick={() => setPicking(true)}>Move to a new manager…</Button>
        </div>
      </div>
      {picking ? (
        <ManagerPickerDialog
          title="Move to which manager?"
          onPick={(u) => {
            setPicking(false);
            setProblems([]);
            setTarget(u);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
        title={`Move ${selected.length} ${selected.length === 1 ? 'person' : 'people'} to ${target?.name ?? ''}?`}
        description="They report to this manager from this month. Earlier months keep their old manager."
        confirmLabel="Move"
        tone="primary"
        pending={move.isPending}
        onConfirm={confirm}
      >
        <ul className="max-h-48 list-disc overflow-auto pl-5 text-sm text-text">
          {selected.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
        {problems.length > 0 ? (
          <div className="mt-3 rounded-md bg-danger-bg p-3 text-sm text-danger-fg">
            <p className="font-medium">No one was moved. Fix these first:</p>
            <ul className="mt-1 list-disc pl-5">
              {problems.map((p) => (
                <li key={p.userId}>
                  {p.name}: {p.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
