'use client';

import type { DoctorDto } from '@greynote/contracts';
import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { fieldClass } from '@/components/ui/Input';
import { useDoctors } from '@/features/field-master-data/hooks/useDoctors';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

/**
 * Pick one doctor by searching: the list is asked of the server for what was typed (name, or the assigned MR's name or code), so it works for any number of doctors.
 */
export function DoctorSearchSelect({ value, onChange }: { value: DoctorDto | null; onChange: (doctor: DoctorDto) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim(), 300);
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);
  const listId = useId();
  const list = useDoctors({ status: 'active', pageSize: 20, ...(search && { search }) });
  const items = list.data?.items ?? [];

  const close = () => {
    setOpen(false);
    setText('');
  };
  useEffect(() => {
    if (!open) return;
    box.current?.focus();
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (d: DoctorDto) => {
    onChange(d);
    close();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label="Doctor"
        onClick={() => setOpen((o) => !o)}
        className={cn(fieldClass, 'inline-flex h-10 items-center justify-between gap-2 text-left')}
      >
        {value ? <span className="truncate">{value.name}</span> : <span className="text-text-subtle">Search and choose a doctor…</span>}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-pop">
          <div className="relative border-b border-border p-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
            <input
              ref={box}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a doctor's name or MR…"
              aria-label="Search doctors"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const first = items[0];
                  if (first) pick(first);
                }
              }}
              className="h-9 w-full rounded-sm bg-transparent pl-8 pr-2 text-sm text-text outline-none placeholder:text-text-subtle"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {list.isFetching && items.length === 0 ? <li className="px-3 py-2 text-sm text-text-muted">Searching…</li> : null}
            {!list.isFetching && items.length === 0 ? <li className="px-3 py-2 text-sm text-text-muted">No doctor found.</li> : null}
            {items.map((d) => (
              <li key={d.id} role="option" aria-selected={d.id === value?.id}>
                <button type="button" tabIndex={-1} onClick={() => pick(d)} className="flex w-full cursor-pointer flex-col rounded-sm px-3 py-1.5 text-left hover:bg-surface-hover">
                  <span className="truncate text-sm text-text">{d.name}</span>
                  <span className="truncate text-xs text-text-subtle">{[d.specialty, d.assignedTo ? `MR ${d.assignedTo.name}` : 'No MR'].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
