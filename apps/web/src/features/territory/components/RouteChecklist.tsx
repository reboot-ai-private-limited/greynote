'use client';

import type { RouteDto } from '@greynote/contracts';
import { useState } from 'react';
import { Input } from '@/components/ui/Input';
import { groupRoutes, setTicked, tickState, type Tick } from '../lib/routeGroups';

const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';

/** A tick that can show "some": a Zone or HQ whose routes are only partly ticked. */
function GroupTick({
  state,
  label,
  onToggle,
}: {
  state: Tick;
  label: string;
  onToggle: () => void;
}) {
  return (
    <input
      type="checkbox"
      className={checkbox}
      aria-label={label}
      checked={state === 'all'}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onChange={onToggle}
    />
  );
}

/**
 * Routes with a tick box each and a search, for choosing several at once. "Select all shown" ticks only what the search leaves visible.
 * Give it `hqs` and `zones` and the routes are grouped Zone > HQ, each with its own tick for all of its routes.
 */
export function RouteChecklist({
  routes,
  selected,
  onChange,
  emptyText,
  flag,
  hqs,
  zones,
}: {
  routes: readonly RouteDto[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
  /** A note shown beside a route that needs one (a warning, never a block). */
  flag?: (route: RouteDto) => string | null;
  hqs?: ReadonlyArray<{ id: string; name: string; zoneId: string }>;
  zones?: ReadonlyArray<{ id: string; name: string }>;
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

  const row = (r: RouteDto) => (
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
  );
  const groups = hqs && zones ? groupRoutes(shown, hqs, zones) : null;

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
          {groups ? (
            <div
              className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border"
              aria-live="polite"
            >
              {groups.length === 0 ? (
                <p className="px-3 py-2 text-[13px] text-text-subtle">No routes match.</p>
              ) : null}
              {groups.map((z) => {
                const zoneIds = z.hqs.flatMap((h) => h.routes.map((r) => r.id));
                return (
                  <section key={z.id}>
                    <label className="flex cursor-pointer items-center gap-3 bg-surface-subtle px-3 py-2 text-sm font-semibold">
                      <GroupTick
                        state={tickState(zoneIds, selected)}
                        label={`All routes in ${z.name}`}
                        onToggle={() =>
                          onChange(
                            setTicked(selected, zoneIds, tickState(zoneIds, selected) !== 'all'),
                          )
                        }
                      />
                      {z.name}
                      <span className="text-xs font-normal text-text-subtle">{zoneIds.length}</span>
                    </label>
                    {z.hqs.map((h) => {
                      const hqIds = h.routes.map((r) => r.id);
                      return (
                        <div key={h.id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 pl-6 text-sm font-medium">
                            <GroupTick
                              state={tickState(hqIds, selected)}
                              label={`All routes in ${h.name}`}
                              onToggle={() =>
                                onChange(
                                  setTicked(selected, hqIds, tickState(hqIds, selected) !== 'all'),
                                )
                              }
                            />
                            {h.name}
                            <span className="text-xs font-normal text-text-subtle">
                              {hqIds.length}
                            </span>
                          </label>
                          <ul className="divide-y divide-border pl-6">
                            {h.routes.map((r) => (
                              <li key={r.id}>{row(r)}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>
          ) : (
            <ul
              className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
              aria-live="polite"
            >
              {shown.length === 0 ? (
                <li className="px-3 py-2 text-[13px] text-text-subtle">No routes match.</li>
              ) : null}
              {shown.map((r) => (
                <li key={r.id}>{row(r)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
