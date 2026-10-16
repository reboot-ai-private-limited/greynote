'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import {
  useManagerCoverage,
  useSetManagerCoverage,
} from '@/features/territory/hooks/useManagerCoverage';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { useDesignations } from '../hooks/useMasterData';
import {
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
 * decides which routes suit them, which holidays apply and which managers can be chosen for them. Their routes are kept on the Routes card.
 */
export function TerritoryCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const designations = useDesignations();
  const designation = designations.data?.find((d) => d.id === user.profile?.designationId)?.name;
  const rule = territoryRule(designation);
  const coverage = useManagerCoverage(user.id);
  const zones = useAllZones();
  const hqs = useAllHqs();
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
      description="Where this employee works. It decides which routes suit them, which holidays apply, and which managers can be chosen. Routes already assigned stay as they are."
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
      renderForm={(close) => (
        <TerritoryForm
          user={user}
          rule={rule}
          initial={{ zoneIds: coverage.data?.zoneIds ?? [], hqIds }}
          onDone={close}
        />
      )}
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
  initial: { zoneIds: string[]; hqIds: string[] };
  onDone: () => void;
}) {
  const hqs = useAllHqs();
  const [zoneIds, setZoneIds] = useState(() => [
    ...new Set([...initial.zoneIds, ...zonesOfHqs(initial.hqIds, hqs.data ?? [])]),
  ]);
  const [hqIds, setHqIds] = useState(initial.hqIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSetManagerCoverage(user.id, onDone);

  function submit() {
    const found = territoryErrors(
      { ...rule, routes: 'none' },
      { zoneIds, hqIds, routeIds: [] },
      hqs.data ?? [],
    );
    if (Object.keys(found).length > 0) return setErrors(found);
    // Zones that are only a way to browse HQs are not stored: the HQs carry their Zone.
    save.mutate({
      hqIds: rule.hqs === 'none' ? [] : hqIds,
      // An MR, ASM or RSM keeps the Zones of their HQs, which the server fills in; a ZSM or NSM sends the Zones picked.
      zoneIds: rule.hqsRequired ? [] : zoneIds,
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
            { zoneIds: ids, hqIds, routeIds: [] },
            { zoneIds, hqIds },
            hqs.data ?? [],
            [],
          );
          setZoneIds(ids);
          setHqIds(next.hqIds);
        }}
        onHqsChange={(ids) => {
          setErrors({});
          setHqIds(ids);
        }}
      />
    </SectionForm>
  );
}
