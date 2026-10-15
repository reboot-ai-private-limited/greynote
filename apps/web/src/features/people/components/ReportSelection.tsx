'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { MoveReportsBar, type Selected } from './MoveReportsBar';

interface SelectionApi {
  has: (id: string) => boolean;
  toggle: (person: Selected) => void;
}

const SelectionContext = createContext<SelectionApi | null>(null);

/** Wraps a tree of people: rows tick themselves with `RowCheck`, and the move bar appears under it once anyone is ticked. */
export function ReportSelection({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlyMap<string, Selected>>(new Map());
  const api: SelectionApi = {
    has: (id) => selected.has(id),
    toggle: (person) =>
      setSelected((current) => {
        const next = new Map(current);
        if (next.has(person.id)) next.delete(person.id);
        else next.set(person.id, person);
        return next;
      }),
  };
  return (
    <SelectionContext.Provider value={api}>
      {children}
      <MoveReportsBar selected={[...selected.values()]} onClear={() => setSelected(new Map())} />
    </SelectionContext.Provider>
  );
}

/** A row's tick box. Nothing renders outside a `ReportSelection` or in a past financial year. */
export function RowCheck({ id, name }: Selected) {
  const selection = useContext(SelectionContext);
  const readOnly = useIsReadOnly();
  if (!selection || readOnly) return null;
  return (
    <input
      type="checkbox"
      aria-label={`Select ${name}`}
      checked={selection.has(id)}
      onChange={() => selection.toggle({ id, name })}
      className="size-4 shrink-0 accent-[var(--color-accent,currentColor)]"
    />
  );
}
