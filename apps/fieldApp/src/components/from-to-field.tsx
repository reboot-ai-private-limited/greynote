import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { routeTypeLabel } from '@/lib/planning';
import { destinationsOffline, listDestinations, listPlanPlaces, rememberPlaces, type Destination } from '@/lib/places';
import { useOnline } from '@/offline';
import { useCachedSource } from '@/offline/cache';
import type { PlaceRow, TerritorySnapshot } from '@/types/sync';

import { OutletPicker } from './outlet-picker';
import { ThemedText } from './themed-text';

type Props = {
  fromPlaceId: string | null | undefined;
  toPlaceId: string | null | undefined;
  /** The route the day goes along (none when staying at From); the server checks it again on save. */
  onChange: (next: { fromPlaceId: string | null; toPlaceId: string | null; routeIds: string[] }) => void;
  disabled?: boolean;
  /**
   * Where the lists come from. `own`: an MR's own plan, offline, from the cached places of their HQ. `server`: a manager's own plan (their
   * team's HQs too) or someone else's being edited (`userId`), looked up online.
   */
  source: { kind: 'own' } | { kind: 'server'; userId?: string };
  error?: string | undefined;
};

/**
 * A Tour Plan day's From → To (decision-log 2026-11-26). To lists only the places a route Admin typed reaches from From, with its km, and
 * "Stay at …" for a day spent there. No route, not offered: Admin adds it under Territory → Routes.
 */
export function FromToField({ fromPlaceId, toPlaceId, onChange, disabled, source, error }: Props) {
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const online = useOnline();
  const serverUser = source.kind === 'server' ? (source.userId ?? '') : null;
  const [serverPlaces, setServerPlaces] = useState<PlaceRow[] | null>(null);
  // Keyed by the From it was loaded for, so a new From shows nothing until its own list arrives.
  const [loadedDest, setLoadedDest] = useState<{ from: string; list: Destination[] } | null>(null);
  const serverDest = loadedDest && loadedDest.from === fromPlaceId ? loadedDest.list : null;
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (serverUser === null || !online) return;
    let alive = true;
    listPlanPlaces(serverUser || undefined)
      .then((p) => {
        if (!alive) return;
        rememberPlaces(p);
        setServerPlaces(p);
      })
      .catch(() => alive && setProblem('Couldn’t load the places. Try again when online.'));
    return () => {
      alive = false;
    };
  }, [serverUser, online]);

  useEffect(() => {
    if (serverUser === null || !fromPlaceId || !online) return;
    let alive = true;
    listDestinations(fromPlaceId, serverUser || undefined)
      .then((d) => {
        if (!alive) return;
        rememberPlaces(d.map((x) => x.place));
        setLoadedDest({ from: fromPlaceId, list: d });
      })
      .catch(() => alive && setLoadedDest({ from: fromPlaceId, list: [] }));
    return () => {
      alive = false;
    };
  }, [serverUser, fromPlaceId, online]);

  const places = serverUser === null ? (territory.data?.places ?? []) : (serverPlaces ?? []);
  const destinations = serverUser === null ? (fromPlaceId ? destinationsOffline(territory.data, fromPlaceId) : []) : (serverDest ?? []);
  const loading = serverUser === null ? !territory.loaded : serverPlaces === null;
  const noRouteYet = Boolean(fromPlaceId) && destinations.length <= 1 && (serverUser === null || serverDest !== null);

  return (
    <View style={styles.box}>
      <OutletPicker
        label="From"
        searchable
        value={fromPlaceId ?? null}
        onChange={(id) => onChange({ fromPlaceId: id, toPlaceId: null, routeIds: [] })}
        options={places.map((p) => ({
          id: p.id,
          name: p.isHqTown ? `${p.name} (HQ town)` : p.name,
          subtitle: [p.hqName, routeTypeLabel(p.type)].filter(Boolean).join(' · '),
        }))}
        disabled={disabled}
        emptyText={
          loading
            ? 'Loading the places…'
            : serverUser === null
              ? 'Your HQ has no places yet. Ask Admin, or pull to sync.'
              : online
                ? 'No places found.'
                : 'Go online to see the places.'
        }
      />
      <OutletPicker
        label="To"
        searchable
        value={toPlaceId ?? null}
        onChange={(id) => {
          const d = destinations.find((x) => x.place.id === id);
          onChange({ fromPlaceId: fromPlaceId ?? null, toPlaceId: id, routeIds: d?.routeId ? [d.routeId] : [] });
        }}
        options={destinations.map((d) => ({
          id: d.place.id,
          name: d.stay ? `Stay at ${d.place.name}` : d.place.name,
          subtitle: d.stay ? 'A day at this place: no travel' : [d.distanceKm ? `${d.distanceKm} km` : 'km not set', routeTypeLabel(d.place.type)].filter(Boolean).join(' · '),
        }))}
        disabled={disabled || !fromPlaceId}
        emptyText={fromPlaceId ? 'Loading…' : 'Choose From first.'}
      />
      {noRouteYet ? (
        <ThemedText type="small" themeColor="textSecondary">
          No route from here yet. Ask Admin to add one under Territory → Routes, or stay at this place.
        </ThemedText>
      ) : null}
      {error || problem ? (
        <ThemedText type="small" themeColor="danger">
          {error ?? problem}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: Spacing.two } });
