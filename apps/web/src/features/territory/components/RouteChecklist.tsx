'use client';

import type { RouteDto } from '@greynote/contracts';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';

const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';

/** Routes with a tick box each and a search, for choosing several at once. "Select all shown" ticks only what the search leaves visible. */
export function RouteChecklist({
  routes,
  selected,
  onChange,
  emptyText,
  flag,
}: {
  routes: readonly RouteDto[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
  /** A note shown beside a route that needs one (a warning, never a block). */
  flag?: (route: RouteDto) => string | null;
}) {
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const shown = routes.filter((r) => !t || r.name.toLowerCase().includes(t));
  const allShown = shown.length > 0 && shown.every((r) => selected.includes(r.id));
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const toggleShown = () => {
    const ids = new Set(shown.map((r) => r.id));
    onChange(
      allShown ? selected.filter((id) => !ids.has(id)) : [...new Set([...selected, ...ids])],
    );
  };

  return (
    <div>
      <Input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search routes, e.g. Kolkata"
        autoComplete="off"
        aria-label="Search routes"
      />
      {routes.length === 0 ? (
        <p className="mt-3 text-[13px] text-text-subtle">{emptyText}</p>
      ) : (
        <>
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              className={checkbox}
              checked={allShown}
              onChange={toggleShown}
              disabled={shown.length === 0}
            />
            Select all shown ({shown.length})
          </label>
          <ul
            className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
            aria-live="polite"
          >
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-text-subtle">No routes match.</li>
            ) : null}
            {shown.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={selected.includes(r.id)}
                    aria-label={r.name}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{r.name}</span>
                    <span className="block text-xs text-text-subtle">
                      {r.type}
                      {r.distanceKm ? ` · ${r.distanceKm} km` : ''}
                      {flag?.(r) ? <span className="ml-2 text-warning-fg">{flag(r)}</span> : null}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
