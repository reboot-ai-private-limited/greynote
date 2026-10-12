import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCachedSource } from '@/offline/cache';
import { WORKING_TYPES, type PlanDay, type WorkingType } from '@/lib/planning';
import type { TerritorySnapshot } from '@/types/sync';

import { ChoiceChips } from './choice-chips';
import { WorkWithPicker } from './work-with-picker';
import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** The server refuses remarks longer than this. */
const REMARKS_MAX = 1000;

type Props = {
  value: PlanDay;
  onChange: (next: PlanDay) => void;
  disabled?: boolean;
};

/**
 * One planned day: working type, routes, remarks. Shared by the Daily Plan, an in-day change
 * and each Monthly Plan day. Routes come from the cached `territory` pull, so it works offline.
 * "Work with" comes from the colleagues the server offers (offline/colleagues.ts).
 */
export function PlanDayForm({ value, onChange, disabled }: Props) {
  const theme = useTheme();
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const routes = territory.data?.routes ?? [];
  const needsRoute = value.workingType === 'FIELD_WORK';

  function setType(workingType: WorkingType) {
    // Only Field Work takes routes (the server refuses them on the other three) and colleagues to work with.
    const field = workingType === 'FIELD_WORK';
    onChange({ ...value, workingType, routeIds: field ? value.routeIds : [], workWith: field ? value.workWith : [] });
  }

  function toggleRoute(id: string) {
    const routeIds = value.routeIds.includes(id)
      ? value.routeIds.filter((r) => r !== id)
      : [...value.routeIds, id];
    onChange({ ...value, routeIds });
  }

  return (
    <>
      <ThemedText type="smallBold">Working type</ThemedText>
      <ChoiceChips options={WORKING_TYPES} value={value.workingType} onChange={setType} disabled={disabled} />

      {!needsRoute ? (
        <ThemedText type="small" themeColor="textSecondary">
          Routes and “Work with” are only picked for Field Work days.
        </ThemedText>
      ) : null}

      {needsRoute ? (
        <>
          <ThemedText type="smallBold">Routes</ThemedText>
          {routes.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {territory.loaded
                ? 'No routes are assigned to you yet. Ask your Admin to assign one.'
                : 'Loading your routes…'}
            </ThemedText>
          ) : (
            routes.map((r) => {
              const selected = value.routeIds.includes(r.id);
              return (
                <Pressable
                  key={r.id}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled }}
                  onPress={() => toggleRoute(r.id)}>
                  <ThemedView
                    type="backgroundElement"
                    style={[styles.route, selected && { borderColor: theme.primary }, disabled && styles.disabled]}>
                    <ThemedView
                      type={selected ? 'primary' : 'backgroundSelected'}
                      style={styles.box}>
                      <ThemedText type="small" themeColor="onPrimary">
                        {selected ? '✓' : ''}
                      </ThemedText>
                    </ThemedView>
                    <ThemedView type="backgroundElement" style={styles.routeText}>
                      <ThemedText type="smallBold">{r.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {r.hqName}
                        {r.distanceKm ? ` · ${r.distanceKm} km` : ''}
                      </ThemedText>
                    </ThemedView>
                  </ThemedView>
                </Pressable>
              );
            })
          )}
        </>
      ) : null}

      {needsRoute ? (
        <WorkWithPicker value={value.workWith} onChange={(workWith) => onChange({ ...value, workWith })} disabled={disabled} />
      ) : null}

      <TextField
        label="Remarks (optional)"
        value={value.remarks ?? ''}
        onChangeText={(t) => onChange({ ...value, remarks: t.length > 0 ? t : null })}
        editable={!disabled}
        maxLength={REMARKS_MAX}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  disabled: { opacity: 0.6 },
  box: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  routeText: { flex: 1 },
});
