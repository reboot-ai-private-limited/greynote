'use client';

import { ChevronRight, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { toStored, toTicks, zoneSummary, type Coverage } from '../lib/coverage';

const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';
const withId = (list: readonly string[], id: string) => (list.includes(id) ? [...list] : [...list, id]);
const without = (list: readonly string[], id: string) => list.filter((x) => x !== id);

/** A row with an arrow that folds away what is under it. The arrow is the button, so it works by keyboard and reads as expanded or not. */
function Fold({ open, onToggle, label, head, children }: { open: boolean; onToggle: () => void; label: string; head: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
          onClick={onToggle}
          className="rounded p-0.5 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <ChevronRight aria-hidden className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
        {head}
      </div>
      {open ? children : null}
    </div>
  );
}

/**
 * Where a distributor works, Zone → HQ → Route. Most distributors sit in one Zone, so it starts from a dropdown: pick a Zone and it is
 * covered whole (every HQ, every route). Untick "All HQs" to choose some of its HQs, and untick an HQ's "All routes" to choose some of
 * its routes — the same reading employees' coverage has. "Add another zone" is there for the few that serve more than one.
 *
 * `value` is what is stored (see `lib/coverage.ts`); this works on the ticks and hands back what to store, so a Zone with nothing narrowed
 * below it stays stored as the whole Zone.
 */
export function CoveragePicker({
  id,
  value,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  value: Coverage;
  onChange: (next: Coverage) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const zones = useAllZones();
  const hqs = useAllHqs();
  const routes = useActiveRoutes();
  const hierarchy = useMemo(() => ({ hqs: hqs.data ?? [], routes: routes.data ?? [] }), [hqs.data, routes.data]);
  const ticks = useMemo(() => toTicks(value, hierarchy), [value, hierarchy]);
  const commit = (next: Coverage) => onChange(toStored(next, hierarchy));

  // What is folded open, and which Zones / HQs are being narrowed but have nothing ticked yet (that looks the same as "all" in the data).
  const [folds, setFolds] = useState<Record<string, boolean>>({});
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [narrowingHqs, setNarrowingHqs] = useState<readonly string[]>([]);
  const [narrowingRoutes, setNarrowingRoutes] = useState<readonly string[]>([]);
  const [adding, setAdding] = useState(false);

  const hqOfRoute = (routeId: string) => hierarchy.routes.find((r) => r.id === routeId)?.hqId;
  const hqsOfZone = (zoneId: string) => hierarchy.hqs.filter((q) => q.zoneId === zoneId).map((q) => q.id);
  const isOpen = (key: string, fallback: boolean) => folds[key] ?? fallback;
  const fold = (key: string, fallback: boolean) => setFolds((f) => ({ ...f, [key]: !(f[key] ?? fallback) }));

  const zoneName = (zoneId: string) => (zones.data ?? []).find((z) => z.id === zoneId)?.name ?? '—';
  // A Zone that has since gone inactive stays listed (it is on the record) so it can be seen and removed; it is not offered to add.
  const chosen = ticks.zoneIds;
  const offered = (zones.data ?? []).filter((z) => z.status === 'active' && !chosen.includes(z.id)).map((z) => ({ value: z.id, label: z.name }));

  const addZone = (zoneId: string) => {
    commit({ ...ticks, zoneIds: withId(ticks.zoneIds, zoneId) });
    setLastAdded(zoneId);
    setAdding(false);
  };
  const removeZone = (zoneId: string) => {
    const gone = new Set(hqsOfZone(zoneId));
    commit({
      zoneIds: without(ticks.zoneIds, zoneId),
      hqIds: ticks.hqIds.filter((q) => !gone.has(q)),
      routeIds: ticks.routeIds.filter((r) => !gone.has(hqOfRoute(r) ?? '')),
    });
    setNarrowingHqs((n) => without(n, zoneId));
  };
  /** "All HQs" back on: nothing in the Zone is ticked below it any more. */
  const allHqs = (zoneId: string) => {
    const gone = new Set(hqsOfZone(zoneId));
    commit({ ...ticks, hqIds: ticks.hqIds.filter((q) => !gone.has(q)), routeIds: ticks.routeIds.filter((r) => !gone.has(hqOfRoute(r) ?? '')) });
    setNarrowingHqs((n) => without(n, zoneId));
  };
  const toggleHq = (hqId: string) => {
    const on = ticks.hqIds.includes(hqId);
    commit({
      ...ticks,
      hqIds: on ? without(ticks.hqIds, hqId) : [...ticks.hqIds, hqId],
      routeIds: on ? ticks.routeIds.filter((r) => hqOfRoute(r) !== hqId) : ticks.routeIds,
    });
    if (on) setNarrowingRoutes((n) => without(n, hqId));
  };
  const allRoutes = (hqId: string) => {
    commit({ ...ticks, routeIds: ticks.routeIds.filter((r) => hqOfRoute(r) !== hqId) });
    setNarrowingRoutes((n) => without(n, hqId));
  };
  const setHqRoutes = (hqId: string, picked: string[]) =>
    commit({ ...ticks, routeIds: [...ticks.routeIds.filter((r) => hqOfRoute(r) !== hqId), ...picked] });

  const loading = zones.isLoading || hqs.isLoading || routes.isLoading;

  return (
    <FormField
      label="Zones, HQs and routes"
      htmlFor={id}
      error={error}
      hint="Most distributors need one zone. Pick it and it covers all its HQs and routes; narrow it only if they serve part of it."
    >
      <div id={id} className="space-y-3">
        {loading ? <p className="text-[13px] text-text-subtle">Loading zones…</p> : null}

        {chosen.map((zoneId) => {
          const key = `z:${zoneId}`;
          const open = isOpen(key, chosen.length === 1 || zoneId === lastAdded);
          const inZone = (hqs.data ?? []).filter((q) => q.zoneId === zoneId && (q.status === 'active' || ticks.hqIds.includes(q.id)));
          const pickedHere = ticks.hqIds.filter((q) => inZone.some((x) => x.id === q));
          const narrowed = pickedHere.length > 0 || narrowingHqs.includes(zoneId);
          return (
            <div key={zoneId} className="rounded-md border border-border p-3">
              <Fold
                open={open}
                onToggle={() => fold(key, chosen.length === 1 || zoneId === lastAdded)}
                label={zoneName(zoneId)}
                head={
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">{zoneName(zoneId)}</p>
                      <p className="text-xs text-text-subtle">{zoneSummary(ticks, zoneId, hierarchy)}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label={`Remove ${zoneName(zoneId)}`} onClick={() => removeZone(zoneId)}>
                      <X aria-hidden className="size-4" />
                    </Button>
                  </div>
                }
              >
                <div className="mt-3 space-y-3 pl-7">
                  {inZone.length === 0 ? (
                    <p className="text-[13px] text-text-subtle">This zone has no HQs yet. It is covered whole, so HQs added later are included.</p>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                        <input
                          type="checkbox"
                          className={checkbox}
                          checked={!narrowed}
                          disabled={disabled}
                          onChange={() => (narrowed ? allHqs(zoneId) : setNarrowingHqs((n) => withId(n, zoneId)))}
                        />
                        All HQs
                        <span className="text-xs font-normal text-text-subtle">includes HQs added later</span>
                      </label>
                      {narrowed ? (
                        <div className="space-y-2 pl-7">
                          {inZone.map((q) => {
                            const hqOn = ticks.hqIds.includes(q.id);
                            const inHq = (routes.data ?? []).filter((r) => r.hqId === q.id);
                            const pickedRoutes = ticks.routeIds.filter((r) => inHq.some((x) => x.id === r));
                            const routesNarrowed = pickedRoutes.length > 0 || narrowingRoutes.includes(q.id);
                            const hqKey = `h:${q.id}`;
                            const head = (
                              <label className="flex cursor-pointer items-center gap-3 text-sm">
                                <input type="checkbox" className={checkbox} checked={hqOn} disabled={disabled} onChange={() => toggleHq(q.id)} />
                                {q.name}
                                {hqOn ? (
                                  <span className="text-xs text-text-subtle">{routesNarrowed ? `${pickedRoutes.length} of ${inHq.length} routes` : `all ${inHq.length} routes`}</span>
                                ) : null}
                              </label>
                            );
                            if (!hqOn) return <div key={q.id} className="pl-6">{head}</div>;
                            return (
                              <Fold key={q.id} open={isOpen(hqKey, false)} onToggle={() => fold(hqKey, false)} label={q.name} head={head}>
                                <div className="mt-2 space-y-2 pl-12">
                                  <label className="flex cursor-pointer items-center gap-3 text-sm">
                                    <input
                                      type="checkbox"
                                      className={checkbox}
                                      checked={!routesNarrowed}
                                      disabled={disabled}
                                      onChange={() => (routesNarrowed ? allRoutes(q.id) : setNarrowingRoutes((n) => withId(n, q.id)))}
                                    />
                                    All routes
                                  </label>
                                  {routesNarrowed ? (
                                    <RouteChecklist routes={inHq} selected={pickedRoutes} onChange={(ids) => setHqRoutes(q.id, ids)} emptyText="No active routes in this HQ." />
                                  ) : null}
                                </div>
                              </Fold>
                            );
                          })}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </Fold>
            </div>
          );
        })}

        {chosen.length === 0 || adding ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <Select
                aria-label={chosen.length === 0 ? 'Zone' : 'Add another zone'}
                value=""
                onValueChange={addZone}
                options={offered}
                placeholder={chosen.length === 0 ? 'Choose a zone' : 'Choose another zone'}
                disabled={disabled || offered.length === 0}
              />
            </div>
            {adding ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            ) : null}
          </div>
        ) : offered.length > 0 ? (
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setAdding(true)}>
            Add another zone
          </Button>
        ) : null}
      </div>
    </FormField>
  );
}
