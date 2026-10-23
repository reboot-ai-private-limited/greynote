import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PlannedDoctor } from '@/lib/planning';
import { useCachedSource } from '@/offline/cache';
import { prettyDay } from '@/offline/day';
import type { FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

import { DoctorAvatar } from './doctor-avatar';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Props = {
  /** The plan's routes: only the MR's doctors on these can be picked. */
  routeIds: string[];
  /** Doctors the MR chose (not the owed ones). */
  picked: string[];
  /** Missed calls still owed from earlier days — always on the plan, so they show ticked and locked. */
  owed: PlannedDoctor[];
  onChange: (doctorIds: string[]) => void;
  disabled?: boolean;
  /** Only list who is on the plan (the plan is submitted or approved). */
  readOnly?: boolean;
  /**
   * Why a doctor can't be visited on the plan's day (the days between visits, dcr.md rule 11), or `null`. Such a doctor is
   * greyed out and can't be ticked; one already ticked can still be unticked.
   */
  tooSoon?: (doctorId: string) => { short: string } | null;
};

/**
 * The doctors to call on a Field Work day. Doctors come from the cached Field Master Data (the MR's own, assigned to them),
 * so the list works offline; saving it needs a connection like the rest of the plan. Doctors owed from earlier days come
 * first and can't be unticked — the server adds them whatever is sent.
 */
export function PlanDoctorsPicker({ routeIds, picked, owed, onChange, disabled, readOnly, tooSoon }: Props) {
  const theme = useTheme();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');

  const { owedRows, pickRows } = useMemo(() => {
    const routeName = new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name]));
    const doctors = master.data?.doctors ?? [];
    const byId = new Map(doctors.map((d) => [d.id, d]));
    const owedIds = new Set(owed.map((o) => o.doctorId));
    const row = (id: string) => {
      const d = byId.get(id);
      return { id, name: d?.name ?? 'Doctor (no longer yours)', photoUrl: d?.photoUrl ?? null, sub: d ? [d.specialty, routeName.get(d.routeId)].filter(Boolean).join(' · ') : '' };
    };
    const onRoutes = doctors
      .filter((d) => routeIds.includes(d.routeId) && !owedIds.has(d.id))
      .map((d) => row(d.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    // A manager's doctors from the people they work with are not in the phone's own list (the server holds them): they are shown
    // as ticked rows with no details, so they can be seen and unticked.
    const known = new Set(doctors.map((d) => d.id));
    const others = picked
      .filter((id) => !known.has(id) && !owedIds.has(id))
      .map((id) => ({ id, name: 'Team member’s doctor', photoUrl: null, sub: 'From the people you work with' }));
    const mine = readOnly ? onRoutes.filter((r) => picked.includes(r.id)) : onRoutes;
    return {
      owedRows: owed.map((o) => ({ ...row(o.doctorId), since: o.carriedFrom })),
      pickRows: [...mine, ...others],
    };
  }, [master.data, territory.data, routeIds, owed, picked, readOnly]);

  if (readOnly && owedRows.length === 0 && pickRows.length === 0) return null;

  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  // Its own column with a gap: inside a wrapper (such as a form field) the rows would otherwise sit flush against each other.
  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">Doctors to call</ThemedText>

      {owedRows.map((r) => (
        <ThemedView key={r.id} type="backgroundElement" style={[styles.row, { borderColor: theme.primary }]}>
          <ThemedView type="primary" style={styles.box}>
            <ThemedText type="small" themeColor="onPrimary">✓</ThemedText>
          </ThemedView>
          <DoctorAvatar name={r.name} photoUrl={r.photoUrl} size={36} />
          <ThemedView type="backgroundElement" style={styles.text}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {r.since ? `Not called since ${prettyDay(r.since)} — still owed` : 'Owed from an earlier day'}
              {tooSoon?.(r.id) ? ` · ${tooSoon(r.id)!.short}` : ''}
              {r.sub ? ` · ${r.sub}` : ''}
            </ThemedText>
          </ThemedView>
        </ThemedView>
      ))}

      {routeIds.length === 0 && !readOnly ? (
        <ThemedText type="small" themeColor="textSecondary">Pick a route to choose its doctors.</ThemedText>
      ) : null}
      {routeIds.length > 0 && pickRows.length === 0 && owedRows.length === 0 && !readOnly ? (
        <ThemedText type="small" themeColor="textSecondary">
          {master.loaded ? 'No doctors are assigned to you on these routes.' : 'Loading your doctors…'}
        </ThemedText>
      ) : null}

      {pickRows.map((r) => {
        const selected = picked.includes(r.id);
        const soon = tooSoon?.(r.id) ?? null;
        // Too soon after a visit: can't be ticked, but a tick already there can be taken off.
        const locked = disabled || (soon !== null && !selected);
        const sub = [soon?.short, r.sub].filter(Boolean).join(' · ');
        if (readOnly) {
          return (
            <ThemedView key={r.id} type="backgroundElement" style={styles.row}>
              <DoctorAvatar name={r.name} photoUrl={r.photoUrl} size={36} />
              <ThemedView type="backgroundElement" style={styles.text}>
                <ThemedText type="smallBold">{r.name}</ThemedText>
                {r.sub ? <ThemedText type="small" themeColor="textSecondary">{r.sub}</ThemedText> : null}
              </ThemedView>
            </ThemedView>
          );
        }
        return (
          <Pressable
            key={r.id}
            disabled={locked}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected, disabled: locked }}
            onPress={() => toggle(r.id)}>
            <ThemedView
              type="backgroundElement"
              style={[styles.row, selected && { borderColor: soon ? theme.danger : theme.primary }, (locked || soon) && styles.disabled]}>
              <ThemedView type={selected ? 'primary' : 'backgroundSelected'} style={styles.box}>
                <ThemedText type="small" themeColor="onPrimary">{selected ? '✓' : ''}</ThemedText>
              </ThemedView>
              <DoctorAvatar name={r.name} photoUrl={r.photoUrl} size={36} />
              <ThemedView type="backgroundElement" style={styles.text}>
                <ThemedText type="smallBold">{r.name}</ThemedText>
                {sub ? <ThemedText type="small" themeColor="textSecondary">{sub}</ThemedText> : null}
              </ThemedView>
            </ThemedView>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  row: {
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
  text: { flex: 1 },
});
