'use client';

import { FormField } from '@/components/ui/FormField';
import { useAllHqs } from '@/features/territory/hooks/useHqs';
import { useAllZones } from '@/features/territory/hooks/useZones';
import { zonesOfHqs, type TerritoryRule } from '../lib/territoryRules';

const checkbox = 'size-4 rounded border-border-strong accent-[var(--color-accent)]';

/**
 * Zones and HQs for one designation (see `territoryRules`): Zones as tick boxes where the designation picks them, and HQs grouped under their Zone
 * with a "select all" per Zone. Controlled: the parent decides what a change does to the routes below it.
 */
export function TerritoryPicker({
  rule,
  zoneIds,
  hqIds,
  onZonesChange,
  onHqsChange,
  errors,
}: {
  rule: TerritoryRule;
  zoneIds: readonly string[];
  hqIds: readonly string[];
  onZonesChange: (ids: string[]) => void;
  onHqsChange: (ids: string[]) => void;
  errors: Record<string, string | undefined>;
}) {
  const zones = useAllZones();
  const hqs = useAllHqs();
  const toggle = (list: readonly string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const activeZones = (zones.data ?? []).filter(
    (z) => z.status === 'active' || zoneIds.includes(z.id),
  );
  // The Zones in play: those ticked and those of the HQs chosen (an employee saved before Zones were stored has HQs only). HQs are listed under these.
  const inPlay = [...new Set([...zoneIds, ...zonesOfHqs(hqIds, hqs.data ?? [])])];
  const shownZones = activeZones.filter((z) => inPlay.includes(z.id));

  return (
    <div className="space-y-5 sm:col-span-2">
      {rule.zones === 'pick' ? (
        <FormField
          label="Zones"
          htmlFor="t-zones"
          error={errors['zoneIds']}
          {...(rule.hqs === 'none' && { hint: 'None ticked means every Zone.' })}
        >
          <div id="t-zones" className="grid gap-2 sm:grid-cols-2">
            {activeZones.map((z) => (
              <label key={z.id} className="flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={inPlay.includes(z.id)}
                  onChange={() => onZonesChange(toggle(inPlay, z.id))}
                />
                {z.name}
              </label>
            ))}
          </div>
        </FormField>
      ) : null}

      {rule.hqs !== 'none' ? (
        <FormField
          label={rule.hqs === 'narrow' ? 'HQs (optional)' : 'HQs'}
          htmlFor="t-hqs"
          error={errors['hqIds']}
          {...(rule.hqs === 'narrow' && {
            hint: 'None ticked means every HQ of the Zones above. Tick some to narrow it.',
          })}
        >
          <div id="t-hqs" className="space-y-4">
            {shownZones.length === 0 ? (
              <p className="text-[13px] text-text-subtle">Tick a zone above to list its HQs.</p>
            ) : null}
            {shownZones.map((z) => {
              const inZone = (hqs.data ?? []).filter(
                (h) => h.zoneId === z.id && (h.status === 'active' || hqIds.includes(h.id)),
              );
              if (inZone.length === 0) return null;
              const all = inZone.every((h) => hqIds.includes(h.id));
              const ids = new Set(inZone.map((h) => h.id));
              return (
                <div key={z.id}>
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium">
                    <input
                      type="checkbox"
                      className={checkbox}
                      checked={all}
                      onChange={() =>
                        onHqsChange(
                          all
                            ? hqIds.filter((id) => !ids.has(id))
                            : [...new Set([...hqIds, ...ids])],
                        )
                      }
                    />
                    {z.name} <span className="text-xs font-normal text-text-subtle">all HQs</span>
                  </label>
                  <div className="mt-2 grid gap-2 pl-7 sm:grid-cols-2">
                    {inZone.map((h) => (
                      <label key={h.id} className="flex cursor-pointer items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          className={checkbox}
                          checked={hqIds.includes(h.id)}
                          onChange={() => onHqsChange(toggle(hqIds, h.id))}
                        />
                        {h.name}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </FormField>
      ) : null}
    </div>
  );
}
