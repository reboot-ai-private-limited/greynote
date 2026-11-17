import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { listTeamRoutes, type TeamRoute, type TeamRoutesPage } from '@/lib/planning';
import { useOnline } from '@/offline';

import { OutletPicker } from './outlet-picker';
import { ThemedText } from './themed-text';

const ALL_HQS = '__all__';

type Props = {
  /** The chosen route ids. */
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Routes already seen (the chosen ones included), so a chosen route keeps its name whatever the current search shows. */
  known: TeamRoute[];
  /** Told about every page loaded, so the form can name the chosen routes and spot an out-station trip. */
  onKnown: (routes: TeamRoute[]) => void;
};

/**
 * A manager's route picker for a Tour Plan day (docs/mobile/team-visibility.md §2a): the routes held by anyone below them. HQ first, then a
 * searchable, paged list inside it, so a ZSM or the NSM never loads every route. Each row says who holds the route and how many doctors are on it.
 * Online only: offline the chosen routes stay, and a note says why nothing new can be picked.
 */
export function TeamRoutesField({ value, onChange, disabled, known, onKnown }: Props) {
  const online = useOnline();
  const [hqId, setHqId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TeamRoute[]>([]);
  const [meta, setMeta] = useState<Pick<TeamRoutesPage, 'hqs' | 'total' | 'totalPages'> | null>(null);
  // Which request (HQ, search, page) has been answered, and with what error: "loading" is derived, so nothing is set inside the effect itself.
  const [settled, setSettled] = useState<{ key: string; error: string | null } | null>(null);
  // A late answer for an old search must not overwrite a newer one.
  const ticket = useRef(0);
  const key = `${hqId ?? ''}|${search}|${page}`;
  const loading = online && settled?.key !== key;
  const error = settled?.key === key ? settled.error : null;

  useEffect(() => {
    if (!online) return;
    const mine = ++ticket.current;
    listTeamRoutes({ hqId, search: search || undefined, page })
      .then((res) => {
        if (mine !== ticket.current) return;
        setMeta({ hqs: res.hqs, total: res.total, totalPages: res.totalPages });
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        onKnown(res.items);
        setSettled({ key, error: null });
      })
      .catch((err: unknown) => {
        if (mine !== ticket.current) return;
        setSettled({ key, error: err instanceof ApiError ? err.message : 'Could not load the routes of your team.' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new HQ, search or page loads again; `onKnown` is a stable setter
  }, [online, hqId, search, page, key]);

  const pickHq = useCallback((id: string) => {
    setHqId(id === ALL_HQS ? null : id);
    setPage(1);
  }, []);
  const doSearch = useCallback((text: string) => {
    setSearch(text);
    setPage(1);
  }, []);

  const describe = (r: TeamRoute) => {
    const who = r.holders.length === 0 ? 'nobody' : r.holders.length <= 2 ? r.holders.map((h) => h.name).join(', ') : `${r.holders[0]?.name} +${r.holders.length - 1}`;
    return `${r.hqName} · ${who} · ${r.doctorCount} doctor${r.doctorCount === 1 ? '' : 's'}`;
  };
  // The chosen routes stay in the list even when the current HQ or search doesn't show them, so ticking and unticking keeps working.
  const shown = [...items, ...known.filter((k) => value.includes(k.id) && !items.some((i) => i.id === k.id))];
  const hqOptions = [{ id: ALL_HQS, name: 'All HQs', subtitle: meta ? `${meta.hqs.reduce((n, h) => n + h.routes, 0)} routes` : undefined }, ...(meta?.hqs ?? []).map((h) => ({ id: h.id, name: h.name, subtitle: `${h.routes} route${h.routes === 1 ? '' : 's'}` }))];

  if (!online && value.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Connect to the internet to choose routes from your team.
      </ThemedText>
    );
  }

  return (
    <View style={styles.box}>
      {online ? (
        <OutletPicker label="HQ" options={hqOptions} value={hqId ?? ALL_HQS} onChange={pickHq} disabled={disabled} emptyText="No HQ has a route held by your team yet." />
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          You are offline: the routes already chosen stay, but new ones can be picked once you are connected.
        </ThemedText>
      )}
      {online ? (
        <OutletPicker
          label="Routes"
          multiple
          searchable
          values={value}
          onChangeValues={onChange}
          options={shown.map((r) => ({ id: r.id, name: r.name, subtitle: describe(r) }))}
          disabled={disabled}
          emptyText={meta?.total === 0 && !search ? 'No MR below you holds a route yet.' : 'No routes match.'}
          onSearch={doSearch}
          onEndReached={() => {
            if (!loading && meta && page < meta.totalPages) setPage((p) => p + 1);
          }}
          loading={loading}
          searchPlaceholder="Search routes"
        />
      ) : null}
      {error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
});
