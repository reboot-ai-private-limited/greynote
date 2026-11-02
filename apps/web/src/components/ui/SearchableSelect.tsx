'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from './cn';
import { fieldClass } from './Input';
import { matchesSearch } from '@/lib/search';
import type { SelectOption } from './Select';

/** A `Select` with a search box at the top of the list, for pickers that run long (HQs, zones). Same props as `Select`. */
export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  'aria-invalid': invalid,
  'aria-label': ariaLabel,
  disabled = false,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  'aria-invalid'?: boolean | undefined;
  'aria-label'?: string | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const listId = useId();
  const shown = useMemo(() => options.filter((o) => matchesSearch(o.label, query)), [options, query]);
  const selected = options.find((o) => o.value === value);

  function close() {
    setOpen(false);
    setQuery('');
  }

  // Click outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    searchBox.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(v: string) {
    onValueChange(v);
    close();
  }

  return (
    <div ref={root} className="relative">
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-invalid={invalid}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(fieldClass, 'inline-flex h-10 items-center justify-between gap-2 text-left')}
      >
        {selected ? <span className="truncate">{selected.label}</span> : <span className="text-text-subtle">{placeholder}</span>}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-surface shadow-pop">
          <div className="relative border-b border-border p-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
            <input
              ref={searchBox}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // Enter must not submit the form this picker sits in.
                  const first = shown[0];
                  if (first) pick(first.value);
                }
              }}
              className="h-9 w-full rounded-sm bg-transparent pl-8 pr-2 text-sm text-text outline-none placeholder:text-text-subtle"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto p-1">
            {shown.length === 0 ? <li className="px-3 py-2 text-sm text-text-muted">No match.</li> : null}
            {shown.map((o) => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => pick(o.value)}
                  className="relative flex h-9 w-full cursor-pointer select-none items-center rounded-sm pl-8 pr-3 text-left text-sm text-text hover:bg-surface-hover"
                >
                  {o.value === value ? <Check aria-hidden className="absolute left-2 size-4 text-accent" /> : null}
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
