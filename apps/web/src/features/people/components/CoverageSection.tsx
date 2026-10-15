'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { useManagerCoverage, useSetManagerCoverage } from '@/features/territory/hooks/useManagerCoverage';
import { useSession } from '@/lib/auth/SessionProvider';
import { useDesignations } from '../hooks/useMasterData';
import { Field, FieldList, SectionCard, SectionForm } from './SectionCard';

const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';

/**
 * Where a manager works: the HQs an ASM or RSM covers (an RSM's region is simply their set of HQs) or the Zones a ZSM covers. The employee wizard
 * then offers a manager only for employees in those HQs. Shown to Admin and HR for managers below the NSM, who covers everywhere.
 */
export function CoverageSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const { user: me } = useSession();
  const designations = useDesignations();
  const designation = designations.data?.find((d) => d.id === user.profile?.designationId);
  const allowed = (me?.role === 'ADMIN' || me?.role === 'HR') && designation && designation.level >= 2 && designation.name !== 'NSM';
  const coverage = useManagerCoverage(user.id, Boolean(allowed));
  const hqs = useAllHqs();
  const zones = useAllZones();
  if (!allowed || !designation) return null;
  const byZone = designation.name === 'ZSM';
  const hqName = new Map((hqs.data ?? []).map((h) => [h.id, h.name]));
  const zoneName = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
  const names = byZone ? (coverage.data?.zoneIds ?? []).map((id) => zoneName.get(id) ?? id) : (coverage.data?.hqIds ?? []).map((id) => hqName.get(id) ?? id);

  return (
    <SectionCard
      title="Coverage"
      description={byZone ? 'The Zones this ZSM covers. Employees in them can be assigned to this manager.' : 'The HQs this manager covers. Employees in them can be assigned to this manager.'}
      readOnly={readOnly}
      view={
        <FieldList>
          <Field label={byZone ? 'Zones' : 'HQs'}>{coverage.isLoading ? 'Loading…' : names.length > 0 ? names.join(', ') : 'None set: listed for every HQ, marked “no coverage set”.'}</Field>
        </FieldList>
      }
      renderForm={(close) => <CoverageForm userId={user.id} byZone={byZone} initial={coverage.data} onDone={close} />}
    />
  );
}

function CoverageForm({ userId, byZone, initial, onDone }: { userId: string; byZone: boolean; initial: { hqIds: string[]; zoneIds: string[] } | undefined; onDone: () => void }) {
  const hqs = useAllHqs();
  const zones = useAllZones();
  const [hqIds, setHqIds] = useState<string[]>(initial?.hqIds ?? []);
  const [zoneIds, setZoneIds] = useState<string[]>(initial?.zoneIds ?? []);
  const save = useSetManagerCoverage(userId, onDone);
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const zoneOf = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
  const activeHqs = (hqs.data ?? []).filter((h) => h.status === 'active' || hqIds.includes(h.id));

  return (
    <SectionForm pending={save.isPending} onCancel={onDone} onSubmit={() => save.mutate({ hqIds: byZone ? [] : hqIds, zoneIds: byZone ? zoneIds : [] })}>
      <div className="space-y-2 sm:col-span-2 lg:col-span-3">
        {byZone
          ? (zones.data ?? [])
              .filter((z) => z.status === 'active' || zoneIds.includes(z.id))
              .map((z) => (
                <label key={z.id} className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" className={checkbox} checked={zoneIds.includes(z.id)} onChange={() => toggle(zoneIds, setZoneIds, z.id)} />
                  {z.name}
                </label>
              ))
          : activeHqs.map((h) => (
              <label key={h.id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input type="checkbox" className={checkbox} checked={hqIds.includes(h.id)} onChange={() => toggle(hqIds, setHqIds, h.id)} />
                {h.name} <span className="text-xs text-text-subtle">{zoneOf.get(h.zoneId)}</span>
              </label>
            ))}
      </div>
    </SectionForm>
  );
}
