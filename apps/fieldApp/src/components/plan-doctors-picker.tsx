import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useCallDoctors } from '@/hooks/use-call-doctors';
import { useTheme } from '@/hooks/use-theme';
import type { PlannedDoctor } from '@/lib/planning';
import { useCachedSource } from '@/offline/cache';
import { prettyDay } from '@/offline/day';
import type { FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

import { DoctorAvatar } from './doctor-avatar';
import { OutletPicker, type OutletOption } from './outlet-picker';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Pill } from './ui-cards';

type Props = {
  /** The plan's routes: only the MR's doctors on these can be picked. A manager's picks are limited to them too when `limitToRoutes` is set (2026-11-17). */
  routeIds: string[];
  /** The day's To place (2026-11-26): when set, the doctors offered are the ones at it, not on `routeIds`. */
  toPlaceId?: string | null | undefined;
  /** A manager's plan is route first: offer only doctors on `routeIds`, and, when the server's list is known, only those on it. */
  limitToRoutes?: boolean;
  onlyIds?: Set<string> | undefined;
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
  /** Doctors already called on the plan's day (2026-11-28): left off the list, named in one line under it. The plan itself keeps them. */
  calledIds?: Set<string>;
};

/**
 * The doctors to call on a Field Work day. Doctors come from the cached Field Master Data (the MR's own, assigned to them),
 * so the list works offline; saving it needs a connection like the rest of the plan. Doctors owed from earlier days come
 * first and can't be unticked — the server adds them whatever is sent.
 *
 * A manager picks their own doctors or anyone's in their downline, but (2026-11-17, dailyplan.md §1b) only those on the day's chosen routes.
 * That list can be long, so it opens as a search (by doctor or MR), and what is picked shows below as rows that can be unticked.
 */
export function PlanDoctorsPicker({ routeIds, toPlaceId, limitToRoutes, onlyIds, picked, owed, onChange, disabled, readOnly, tooSoon, calledIds }: Props) {
  const theme = useTheme();
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { isManager, doctors: callDoctors, byId: callDoctorById } = useCallDoctors();

  const { owedRows, pickRows, options } = useMemo(() => {
    // Where the day goes decides its doctors: its To place, or for an older day its routes.
    const onDay = (d: { routeId: string; placeId?: string | undefined }) => (toPlaceId ? d.placeId === toPlaceId : routeIds.includes(d.routeId));
    const routeName = new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name]));
    const doctors = master.data?.doctors ?? [];
    const owedIds = new Set(owed.map((o) => o.doctorId));
    const row = (id: string) => {
      const d = callDoctorById.get(id);
      return {
        id,
        // The team list may not have reached the phone yet, so for a manager a missing doctor isn't "no longer yours".
        name: d?.name ?? (isManager ? 'Team member’s doctor' : 'Doctor (no longer yours)'),
        photoUrl: d?.photoUrl ?? null,
        sub: d ? [d.mrLabel, d.specialty, routeName.get(d.routeId)].filter(Boolean).join(' · ') : '',
      };
    };
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const owedRows = owed.map((o) => ({ ...row(o.doctorId), since: o.carriedFrom }));
    if (isManager) {
      const onDayRoute = (d: { routeId: string; placeId?: string | undefined }) => (onDay(d) ? 0 : 1);
      const options: OutletOption[] = callDoctors
        .filter((d) => !owedIds.has(d.id) && (!limitToRoutes || (onDay(d) && (!onlyIds || onlyIds.has(d.id)))))
        .sort((a, b) => onDayRoute(a) - onDayRoute(b) || byName(a, b))
        .map((d) => {
          const soon = tooSoon?.(d.id) ?? null;
          return {
            id: d.id,
            name: d.name,
            photoUrl: d.photoUrl ?? null,
            disabled: soon !== null,
            subtitle: [soon?.short, d.mrLabel ?? 'Your doctor', d.specialty].filter(Boolean).join(' · '),
          };
        });
      return { owedRows, options, pickRows: picked.filter((id) => !owedIds.has(id)).map(row).sort(byName) };
    }
    const onRoutes = doctors
      .filter((d) => onDay(d) && !owedIds.has(d.id))
      .map((d) => row(d.id))
      .sort(byName);
    const known = new Set(doctors.map((d) => d.id));
    const others = picked
      .filter((id) => !known.has(id) && !owedIds.has(id))
      .map((id) => ({ id, name: 'Team member’s doctor', photoUrl: null, sub: 'From the people you work with' }));
    const mine = readOnly ? onRoutes.filter((r) => picked.includes(r.id)) : onRoutes;
    return { owedRows, options: [], pickRows: [...mine, ...others] };
  }, [master.data, territory.data, routeIds, toPlaceId, limitToRoutes, onlyIds, owed, picked, readOnly, isManager, callDoctors, callDoctorById, tooSoon]);

  if (readOnly && owedRows.length === 0 && pickRows.length === 0) return null;

  // Called already: off the list. The planned ones (carried in or ticked) are named below, so they don't seem lost.
  const called = (id: string) => calledIds?.has(id) ?? false;
  const shownOwed = owedRows.filter((r) => !called(r.id));
  const shownPicks = pickRows.filter((r) => !called(r.id));
  const calledNames = [...owedRows, ...pickRows.filter((r) => picked.includes(r.id))].filter((r) => called(r.id)).map((r) => r.name);

  const toggle = (id: string) => onChange(picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id]);

  // Its own column with a gap: inside a wrapper (such as a form field) the rows would otherwise sit flush against each other.
  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">Doctors to call</ThemedText>

      {isManager && !readOnly ? (
        <OutletPicker
          label="Add doctors"
          multiple
          searchable
          avatars
          options={options}
          values={picked}
          onChangeValues={onChange}
          disabled={disabled}
          searchPlaceholder="Search doctor or MR"
          emptyText="No doctors yet. Connect to the internet so your team’s doctors can load."
        />
      ) : null}

      {shownOwed.map((r) => (
        <ThemedView key={r.id} type="backgroundElement" style={[styles.row, { borderColor: theme.primary }]}>
          {/* Carried in (2026-11-28): locked, not a tick — it stays until called. */}
          <ThemedView type="primary" style={styles.box} accessibilityLabel="Carried in, can't be removed">
            <ThemedText type="small" themeColor="onPrimary">🔒</ThemedText>
          </ThemedView>
          <DoctorAvatar name={r.name} photoUrl={r.photoUrl} size={36} />
          <ThemedView type="backgroundElement" style={styles.text}>
            <ThemedText type="smallBold">{r.name}</ThemedText>
            {/* The tag sits under the name, not beside it: beside it, a phone's width left the name one word a line. */}
            <View style={styles.tag}>
              <Pill text={r.since ? `Carried in · ${prettyDay(r.since)}` : 'Carried in'} accent="amber" />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {'Stays until you call them'}
              {tooSoon?.(r.id) ? ` · ${tooSoon(r.id)!.short}` : ''}
              {r.sub ? ` · ${r.sub}` : ''}
            </ThemedText>
          </ThemedView>
        </ThemedView>
      ))}

      {!isManager && routeIds.length === 0 && !toPlaceId && !readOnly ? (
        <ThemedText type="small" themeColor="textSecondary">Pick a route to choose its doctors.</ThemedText>
      ) : null}
      {!isManager && (routeIds.length > 0 || toPlaceId) && pickRows.length === 0 && owedRows.length === 0 && !readOnly ? (
        <ThemedText type="small" themeColor="textSecondary">
          {master.loaded ? (toPlaceId ? 'No doctors are assigned to you at this place.' : 'No doctors are assigned to you on these routes.') : 'Loading your doctors…'}
        </ThemedText>
      ) : null}

      {shownPicks.map((r) => {
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
      {calledNames.length > 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {`${calledNames.length} already called ${readOnly ? 'that day' : 'today'}: ${calledNames.join(', ')}`}
        </ThemedText>
      ) : null}
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
  text: { flex: 1, gap: 2 },
  tag: { flexDirection: 'row', marginVertical: 2 },
});
