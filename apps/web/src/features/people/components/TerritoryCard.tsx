'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { RouteChecklist } from '@/features/territory/components/RouteChecklist';
import { useManagerCoverage, useSetTerritory } from '@/features/territory/hooks/useManagerCoverage';
import { useActiveRoutes } from '@/features/territory/hooks/useRoutes';
import { useUserRoutes } from '@/features/territory/hooks/useUserRoutes';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { diffRoutes } from '@/features/territory/lib/routeGroups';
import { useDesignations } from '../hooks/useMasterData';
import {
  afterHqsChange,
  afterZonesChange,
  territoryErrors,
  territoryRule,
  zonesOfHqs,
  type TerritoryRule,
} from '../lib/territoryRules';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';
import { TerritoryPicker } from './TerritoryPicker';

/**
 * Where an employee works: the Zones and HQs they cover, by designation (an MR, ASM or RSM picks HQs, a ZSM Zones, an NSM Zones or all). It
 * decides which routes suit them, which holidays apply and which managers can be chosen for them. Routes are only what is ticked here or on the Routes card: an HQ gives none by itself.
 */
export function TerritoryCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const designations = useDesignations();
  const designation = designations.data?.find((d) => d.id === user.profile?.designationId)?.name;
  const rule = territoryRule(designation);
  const coverage = useManagerCoverage(user.id);
  const zones = useAllZones();
  const hqs = useAllHqs();
  const mine = useUserRoutes(user.id);
  if (!designation || (rule.zones === 'browse' && rule.hqs === 'none')) return null;

  const zoneName = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
  const hqName = new Map((hqs.data ?? []).map((h) => [h.id, h.name]));
  const hqIds = coverage.data?.hqIds ?? [];
  const zoneIds = [
    ...new Set([...(coverage.data?.zoneIds ?? []), ...zonesOfHqs(hqIds, hqs.data ?? [])]),
  ];
  const names = (ids: readonly string[], map: Map<string, string>) =>
    ids.map((id) => map.get(id) ?? id).join(', ');

  return (
    <SectionCard
      title="Territory"
      description="Where this employee works, and the routes they work in it. Routes are only what is ticked; an HQ gives none by itself."
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="Zones">
            {coverage.isLoading
              ? 'Loading…'
              : zoneIds.length > 0
                ? names(zoneIds, zoneName)
                : rule.zones === 'pick'
                  ? 'Every zone'
                  : null}
          </Field>
          {rule.hqs !== 'none' ? (
            <Field label="HQs">
              {coverage.isLoading
                ? 'Loading…'
                : hqIds.length > 0
                  ? names(hqIds, hqName)
                  : rule.hqs === 'narrow' && zoneIds.length > 0
                    ? 'Every HQ of these zones'
                    : null}
            </Field>
          ) : null}
        </FieldList>
      }
      renderForm={(close) =>
        mine.isLoading ? (
          <p className="text-[13px] text-text-subtle">Loading…</p>
        ) : (
          <TerritoryForm
            user={user}
            rule={rule}
            initial={{
              zoneIds: coverage.data?.zoneIds ?? [],
              hqIds,
              routeIds: (mine.data ?? []).map((r) => r.id),
            }}
            onDone={close}
          />
        )
      }
    />
  );
}

function TerritoryForm({
  user,
  rule,
  initial,
  onDone,
}: {
  user: UserDetailDto;
  rule: TerritoryRule;
  initial: { zoneIds: string[]; hqIds: string[]; routeIds: string[] };
  onDone: () => void;
}) {
  const hqs = useAllHqs();
  const zones = useAllZones();
  const allRoutes = useActiveRoutes(undefined, rule.routes !== 'none');
  const routes = allRoutes.data ?? [];
  const [routeIds, setRouteIds] = useState(initial.routeIds);
  const [zoneIds, setZoneIds] = useState(() => [
    ...new Set([...initial.zoneIds, ...zonesOfHqs(initial.hqIds, hqs.data ?? [])]),
  ]);
  const [hqIds, setHqIds] = useState(initial.hqIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSetTerritory(user.id, onDone);

  function submit() {
    const found = territoryErrors(rule, { zoneIds, hqIds, routeIds }, hqs.data ?? []);
    if (Object.keys(found).length > 0) return setErrors(found);
    const { add, remove } = diffRoutes(initial.routeIds, routeIds);
    // Zones that are only a way to browse HQs are not stored: the HQs carry their Zone.
    save.mutate({
      coverage: {
        hqIds: rule.hqs === 'none' ? [] : hqIds,
        // An MR, ASM or RSM keeps the Zones of their HQs, which the server fills in; a ZSM or NSM sends the Zones picked.
        zoneIds: rule.hqsRequired ? [] : zoneIds,
      },
      add,
      remove,
    });
  }

  return (
    <SectionForm pending={save.isPending} onCancel={onDone} onSubmit={submit}>
      <TerritoryPicker
        rule={rule}
        zoneIds={zoneIds}
        hqIds={hqIds}
        errors={errors}
        onZonesChange={(ids) => {
          setErrors({});
          const next = afterZonesChange(
            rule,
            { zoneIds: ids, hqIds, routeIds },
            { zoneIds, hqIds },
            hqs.data ?? [],
            routes,
          );
          setZoneIds(ids);
          setHqIds(next.hqIds);
          setRouteIds(next.routeIds);
        }}
        onHqsChange={(ids) => {
          setErrors({});
          setHqIds(ids);
          setRouteIds(
            afterHqsChange({ zoneIds, hqIds: ids, routeIds }, hqIds, routes, rule).routeIds,
          );
        }}
      />
      {rule.routes !== 'none' && hqIds.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium">
            {rule.routes === 'required' ? 'Routes' : 'Routes (optional)'}
          </p>
          <p className="mb-2 text-[13px] text-text-subtle">
            Every route of an HQ you add is ticked here for you to check; untick any not needed.
            Routes created later are added from the Routes card.
          </p>
          {errors['routeIds'] ? (
            <p role="alert" className="mb-2 text-[13px] text-danger">
              {errors['routeIds']}
            </p>
          ) : null}
          {allRoutes.isLoading ? (
            <p className="text-[13px] text-text-subtle">Loading…</p>
          ) : (
            <RouteChecklist
              routes={routes.filter((r) => hqIds.includes(r.hqId))}
              selected={routeIds}
              onChange={setRouteIds}
              hqs={hqs.data ?? []}
              zones={zones.data ?? []}
              emptyText="These HQs have no active routes yet. Create one under Territory → Routes first."
            />
          )}
        </div>
      ) : null}
    </SectionForm>
  );
}
