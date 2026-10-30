'use client';

import type { ExtendManagerTerritoryDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useManagerCandidatesAbove } from '@/features/territory/hooks/useManagerCoverage';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { timing } from '@/lib/hooks/timing';
import { useFieldDirectory, useManagerCandidates } from '../hooks/useUsers';

const ASM = 2;
const RSM = 3;
const NSM = 5;

interface Row {
  id: string;
  name: string;
  employeeCode: string;
  designation?: string | null | undefined;
  level?: number | undefined;
  coverage?: 'covers' | 'none' | 'missing' | undefined;
  noCoverage?: boolean | undefined;
}

function ConfirmTerritory({
  manager,
  offer,
  onBack,
  onDone,
}: {
  manager: Row;
  offer: { hqId?: string | undefined; routeIds: readonly string[] };
  onBack: () => void;
  onDone: (extend: ExtendManagerTerritoryDto | undefined) => void;
}) {
  const hqs = useAllHqs();
  const zones = useAllZones();
  const hq = (hqs.data ?? []).find((h) => h.id === offer.hqId);
  // The NSM always counts as covering, but a ZSM or NSM still gets the Zone saved, so the box is shown for the NSM too.
  const isNsm = manager.level === NSM;
  const needsHq = Boolean(hq) && (manager.coverage !== 'covers' || isNsm);
  const canHaveRoutes = manager.level === ASM || manager.level === RSM;
  const routes = useActiveRoutes(undefined, canHaveRoutes);
  const [addHq, setAddHq] = useState(true);
  const [routeIds, setRouteIds] = useState<string[]>([...offer.routeIds]);

  function done() {
    const extend: ExtendManagerTerritoryDto = {
      hqIds: needsHq && addHq && hq ? [hq.id] : [],
      zoneIds: needsHq && addHq && hq ? [hq.zoneId] : [],
      routeIds: canHaveRoutes ? routeIds : [],
    };
    const nothing = extend.hqIds.length === 0 && extend.routeIds.length === 0;
    onDone(nothing ? undefined : extend);
  }

  return (
    <div className="space-y-4">
      {needsHq && hq ? (
        <div className="space-y-1">
          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-accent)]"
              checked={addHq}
              onChange={(e) => setAddHq(e.target.checked)}
            />
            {isNsm
              ? `Add the Zone of ${hq.name} to ${manager.name}’s Zones`
              : `Add ${hq.name} to ${manager.name}’s territory${manager.coverage === 'missing' ? ' (it isn’t covered now)' : ''}`}
          </label>
          {isNsm ? (
            <p className="text-[13px] text-text-subtle">
              An NSM with no Zones saved covers every Zone. Saving Zones limits their zone-specific
              holidays to the Zones listed.
            </p>
          ) : null}
        </div>
      ) : null}
      {canHaveRoutes ? (
        <div>
          <p className="mb-1 text-sm font-medium">Routes for {manager.name} (optional)</p>
          <p className="mb-2 text-[13px] text-text-subtle">
            The employee’s routes are ticked. Untick any, or tick more. Routes can be changed later
            on their Routes card.
          </p>
          {routes.isLoading ? (
            <p className="text-[13px] text-text-subtle">Loading…</p>
          ) : (
            <RouteChecklist
              routes={routes.data ?? []}
              selected={routeIds}
              onChange={setRouteIds}
              hqs={hqs.data ?? []}
              zones={zones.data ?? []}
              emptyText="There are no routes yet."
            />
          )}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button onClick={done}>Choose {manager.name}</Button>
      </div>
    </div>
  );
}

/**
 * Search active field employees and choose one. For a manager, the employee themselves is not
 * offered (`selfId`); other screens reuse it to pick an MR or an ASM with their own `title`.
 *
 * With `above` it is the reporting-manager picker: only designations above `level` are offered (any higher level, so a vacant one can be
 * skipped), those covering `hqId` first, each with its designation in brackets. A manager whose coverage leaves the HQ out is listed last.
 *
 * With `offer` (the employee's HQ and routes) choosing a manager opens a short confirm step: add the HQ (and its Zone) to the manager's
 * territory, and for an ASM or RSM tick the routes to give them too. Everything is ticked by default and can be changed; `onPick` then
 * carries `extend` for the caller to send once the manager is saved. A ZSM already covering skips it; the NSM is always offered the Zone.
 */
export function ManagerPickerDialog({
  selfId,
  title = 'Choose a manager',
  label = 'Manager',
  above,
  offer,
  onPick,
  onClose,
}: {
  selfId?: string;
  title?: string;
  label?: string;
  above?: { level: number; hqId?: string | undefined };
  /** The employee being placed: their HQ and the routes that would be ticked for the manager. */
  offer?: { hqId?: string | undefined; routeIds: readonly string[] };
  onPick: (user: { id: string; name: string; extend?: ExtendManagerTerritoryDto }) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const [confirming, setConfirming] = useState<Row | null>(null);
  const { user: me } = useSession();
  // The Accountant picks from the names-only directory and searches it here; Admin and HR search the employee list.
  const viaDirectory = me?.role === 'ACCOUNTANT';
  const search = useDebouncedValue(term.trim(), timing.searchDebounceMs);
  const scoped = useManagerCandidatesAbove(
    { level: above?.level ?? 1, hqId: above?.hqId, search, excludeUserId: selfId },
    Boolean(above),
  );
  const listed = useManagerCandidates(term, !above && !viaDirectory);
  const directory = useFieldDirectory(!above && viaDirectory);
  const candidates = above ? scoped : viaDirectory ? directory : listed;
  const needle = term.trim().toLowerCase();
  const found: Row[] = above
    ? (scoped.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        employeeCode: c.employeeCode,
        designation: c.designation.name,
        level: c.designation.level,
        coverage: c.coverage,
        noCoverage: c.coverage === 'none',
      }))
    : viaDirectory
      ? (directory.data ?? []).filter(
          (u) =>
            !needle ||
            u.name.toLowerCase().includes(needle) ||
            u.employeeCode.toLowerCase().includes(needle),
        )
      : (listed.data?.items ?? []);
  const rows = found.filter((u) => u.id !== selfId);

  /** The confirm step is worth showing when there is a coverage gap to fill, or an ASM/RSM who can be given routes. */
  const choose = (u: Row) => {
    const gap =
      Boolean(offer?.hqId) &&
      u.coverage !== undefined &&
      (u.coverage !== 'covers' || u.level === NSM);
    const routes = offer !== undefined && (u.level === ASM || u.level === RSM);
    if (offer && (gap || routes)) setConfirming(u);
    else onPick({ id: u.id, name: u.name });
  };

  if (confirming && offer) {
    return (
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title={`Add to ${confirming.name}'s territory`}
        description="Tick what this manager should also get. Nothing is taken away from them."
      >
        <ConfirmTerritory
          manager={confirming}
          offer={offer}
          onBack={() => setConfirming(null)}
          onDone={(extend) =>
            onPick({ id: confirming.id, name: confirming.name, ...(extend && { extend }) })
          }
        />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      description="Search by name or employee code."
    >
      <label htmlFor="manager-search" className="mb-1.5 block text-sm font-medium text-text">
        {label}
      </label>
      <Input
        id="manager-search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="e.g. Rahul or ASM003"
        autoComplete="off"
      />
      <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto">
        {candidates.isLoading ? (
          <p className="text-[13px] text-text-subtle">Searching…</p>
        ) : candidates.error ? (
          <p role="alert" className="text-[13px] text-danger-fg">
            {toErrorState(candidates.error).message}
          </p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-text-subtle">
            {above
              ? 'No manager above this designation covers this HQ. You can leave the manager empty: approvals then go straight to Admin or HR.'
              : 'No active employees match.'}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text">
                    {u.name}
                    {u.designation ? (
                      <span className="font-normal text-text-muted"> ({u.designation})</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-text-subtle">
                    {u.employeeCode}
                    {u.noCoverage ? ' · no coverage set' : ''}
                    {u.coverage === 'missing' ? ' · doesn’t cover this HQ' : ''}
                  </p>
                </div>
                <Button size="sm" onClick={() => choose(u)}>
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
