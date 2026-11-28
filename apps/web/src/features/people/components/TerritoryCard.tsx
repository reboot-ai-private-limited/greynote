'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useTeamHqs } from '@/features/territory/hooks/useTeamHqs';
import { useManagerCoverage, useSetTerritory } from '@/features/territory/hooks/useManagerCoverage';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { territoryErrors, territoryRule } from '../lib/territoryRules';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';
import { TerritoryPicker } from './TerritoryPicker';

/**
 * The one HQ an employee is based in (decision-log 2026-11-26), for every designation. It decides their TA/DA, which holidays apply, and
 * the routes they plan (a manager also plans their team's HQs, without those becoming theirs).
 */
export function TerritoryCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const coverage = useManagerCoverage(user.id);
  const zones = useAllZones();
  const hqs = useAllHqs();
  const hqId = coverage.data?.hqIds[0];
  const hq = hqs.data?.find((h) => h.id === hqId);
  const zone = zones.data?.find((z) => z.id === hq?.zoneId);
  // A manager's team is based in these too (2026-11-28); their own HQ stays the one above.
  const teamHqs = (useTeamHqs(user.id).data ?? []).filter((h) => !h.own);

  return (
    <SectionCard
      title="HQ"
      description="Where this employee is based. TA/DA, holidays and the routes they plan all follow it."
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label="HQ">
            {coverage.isLoading ? (
              'Loading…'
            ) : hq ? (
              hq.name
            ) : (
              <span className="text-danger">Not set — they can plan no route until an HQ is chosen.</span>
            )}
          </Field>
          <Field label="Zone">{zone?.name ?? null}</Field>
          {teamHqs.length > 0 ? <Field label="Team HQs">{teamHqs.map((h) => h.name).join(', ')}</Field> : null}
        </FieldList>
      }
      renderForm={(close) => <HqForm user={user} initial={hqId ? [hqId] : []} onDone={close} />}
    />
  );
}

function HqForm({ user, initial, onDone }: { user: UserDetailDto; initial: string[]; onDone: () => void }) {
  const [hqIds, setHqIds] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSetTerritory(user.id, onDone);

  function submit() {
    const found = territoryErrors(territoryRule(), { hqIds });
    if (Object.keys(found).length > 0) return setErrors(found);
    if (hqIds[0] === initial[0]) return onDone();
    save.mutate({ coverage: { hqIds, zoneIds: [] }, add: [], remove: [] });
  }

  return (
    <SectionForm pending={save.isPending} onCancel={onDone} onSubmit={submit}>
      <TerritoryPicker
        hqIds={hqIds}
        errors={errors}
        onHqsChange={(ids) => {
          setErrors({});
          setHqIds(ids);
        }}
      />
    </SectionForm>
  );
}
