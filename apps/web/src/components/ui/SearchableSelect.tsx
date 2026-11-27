'use client';

import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { fieldClass } from './Input';
import { matchesSearch } from '@/lib/search';
import type { SelectOption } from './Select';

/** Room the open list needs below the field before it opens upward instead (search box + up to 15rem of options). */
const LIST_HEIGHT = 300;

/**
 * Inside a dialog the list would be cut off by the dialog's scrolling body, so it is drawn on the dialog element itself (still inside it,
 * so the dialog keeps focus and clicks) and placed at the field — below it, or above when there isn't room below (2026-11-27).
 */
function placeInDialog(trigger: HTMLElement, dialog: HTMLElement): CSSProperties {
  const t = trigger.getBoundingClientRect();
  const d = dialog.getBoundingClientRect();
  const left = t.left - d.left - dialog.clientLeft;
  const below = window.innerHeight - t.bottom;
  if (below < LIST_HEIGHT && t.top > below) {
    return { position: 'absolute', left, width: t.width, bottom: d.top + dialog.clientTop + dialog.clientHeight - t.top + 4 };
  }
  return { position: 'absolute', left, width: t.width, top: t.bottom - d.top - dialog.clientTop + 4 };
}

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
  onSearchChange,
  filterLocally = true,
  emptyText = 'No match.',
  loading = false,
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
  /** Told whenever the typed text changes (and with '' on close), so a long list can be searched on the server. */
  onSearchChange?: ((query: string) => void) | undefined;
  /** `false` when the options already are the search's result: nothing is filtered here. */
  filterLocally?: boolean;
  emptyText?: string;
  /** A search is running: shows a spinner in the search box and dims the results, which may be out of date. */
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<HTMLElement | null>(null);
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchChanged = useRef(onSearchChange);
  searchChanged.current = onSearchChange;
  const shown = useMemo(() => (filterLocally ? options.filter((o) => matchesSearch(o.label, query)) : options), [options, query, filterLocally]);
  const selected = options.find((o) => o.value === value);

  function close() {
    setOpen(false);
    setQuery('');
    searchChanged.current?.('');
  }

  // Click outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    searchBox.current?.focus();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (root.current && !root.current.contains(target) && !popup.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // In a dialog: keep the list at the field while the dialog scrolls or the window resizes.
  useEffect(() => {
    if (!open || !dialog) return;
    const measure = () => root.current && setPlace(placeInDialog(root.current, dialog));
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, dialog]);

  function toggle(trigger: HTMLElement) {
    if (open) return close();
    const host = trigger.closest<HTMLElement>('[role="dialog"]');
    setDialog(host);
    setPlace(host ? placeInDialog(trigger, host) : null);
    setOpen(true);
  }

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
        onClick={(e) => toggle(e.currentTarget)}
        className={cn(fieldClass, 'inline-flex h-10 items-center justify-between gap-2 text-left')}
      >
        {selected ? <span className="truncate">{selected.label}</span> : <span className="text-text-subtle">{placeholder}</span>}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-text-subtle" />
      </button>
      {open ? withPortal(dialog, (
        <div ref={popup} style={place ?? undefined} className={cn('z-50 overflow-hidden rounded-md border border-border bg-surface shadow-pop', !dialog && 'absolute left-0 top-full mt-1 w-full')}>
          <div className="relative border-b border-border p-1">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" />
            <input
              ref={searchBox}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault(); // Enter must not submit the form this picker sits in.
                  const first = shown[0];
                  if (first) pick(first.value);
                }
              }}
              className="h-9 w-full rounded-sm bg-transparent pl-8 pr-8 text-sm text-text outline-none placeholder:text-text-subtle"
            />
            {loading ? <Loader2 role="status" aria-label="Searching" className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-subtle" /> : null}
          </div>
          <ul id={listId} role="listbox" aria-busy={loading} className={cn('max-h-60 overflow-y-auto p-1 transition-opacity', loading && shown.length > 0 && 'opacity-60')}>
            {shown.length === 0 ? <li className="px-3 py-2 text-sm text-text-muted">{loading ? 'Searching…' : emptyText}</li> : null}
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
      )) : null}
    </div>
  );
}

const withPortal = (host: HTMLElement | null, node: ReactNode) => (host ? createPortal(node, host) : node);
