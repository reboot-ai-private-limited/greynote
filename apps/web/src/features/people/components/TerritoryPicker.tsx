'use client';

import { useMemo } from 'react';
import { FormField } from '@/components/ui/FormField';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';

/**
 * The one HQ an employee is based in (decision-log 2026-11-26), labelled with its Zone. It decides their TA/DA, their holidays and the
 * routes they plan. An inactive HQ already chosen stays listed so the form shows it.
 */
export function TerritoryPicker({
  hqIds,
  onHqsChange,
  errors,
}: {
  hqIds: readonly string[];
  onHqsChange: (ids: string[]) => void;
  errors: Record<string, string | undefined>;
}) {
  const zones = useAllZones();
  const hqs = useAllHqs();
  const options = useMemo(() => {
    const zoneName = new Map((zones.data ?? []).map((z) => [z.id, z.name]));
    return (hqs.data ?? [])
      .filter((h) => h.status === 'active' || hqIds.includes(h.id))
      .map((h) => ({ value: h.id, label: `${h.name} — ${zoneName.get(h.zoneId) ?? ''}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [hqs.data, zones.data, hqIds]);

  return (
    <div className="sm:col-span-2">
      <FormField
        label="HQ"
        htmlFor="t-hq"
        error={errors['hqIds']}
        hint="Every employee is based in one HQ. TA/DA is worked out from it. A manager can also plan trips into their team's HQs, which are always out-station for them."
      >
        <SearchableSelect
          id="t-hq"
          value={hqIds[0] ?? ''}
          onValueChange={(id) => onHqsChange(id ? [id] : [])}
          options={options}
          placeholder={hqs.isLoading ? 'Loading HQs…' : 'Choose an HQ'}
          searchPlaceholder="Search HQs"
          aria-invalid={errors['hqIds'] ? true : undefined}
        />
      </FormField>
    </div>
  );
}
