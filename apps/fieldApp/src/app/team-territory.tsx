import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { PagedList } from '@/components/team/paged-list';
import { ThemedText } from '@/components/themed-text';
import { CardSection, InfoCard, Pill, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { getTeamTerritory, listHqRoutesPage, type HqRoute, type TeamZone } from '@/lib/team-visibility';
import { useOnline } from '@/offline';

/**
 * Team → Territory (managers): your zones and HQs, worked out from where your team works and what you own. "Routes" opens an HQ's routes in place, with the
 * search on top, a page at a time (a ZSM or the NSM never loads every route).
 */
export default function TeamTerritoryScreen() {
  const online = useOnline();
  const [zones, setZones] = useState<TeamZone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One HQ open at a time: its routes list under it, with the search on top.
  const [openHq, setOpenHq] = useState<string | null>(null);

  useEffect(() => {
    if (!online) return;
    getTeamTerritory()
      .then((z) => {
        setZones(z);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof ApiError || err instanceof NetworkError ? err.message : 'Could not load your territory.'));
  }, [online]);

  return (
    <ScreenShell title="Territory" subtitle="Zones and HQs of your team">
      {!online ? <Notice tone="info">Connect to the internet to see your territory.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {online && !zones && !error ? <Skeleton cards={2} lines={2} /> : null}
      {zones && zones.length === 0 ? <Notice tone="info">Nobody in your team has an HQ yet, and you own none.</Notice> : null}
      {(zones ?? []).map((z) => (
        <CardSection key={z.id} icon={sym('map', 'map')} accent="teal" title={z.name} count={z.hqs.length}>
          {z.hqs.map((h) => (
            <View key={h.id} style={styles.block}>
              <View style={styles.hq}>
                <View style={styles.grow}>
                  <ThemedText type="smallBold">{h.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {h.members} {h.members === 1 ? 'person' : 'people'}
                  </ThemedText>
                </View>
                {h.owned ? <Pill text="Owned" accent="green" /> : null}
                <PrimaryButton label={openHq === h.id ? 'Routes ▴' : 'Routes ▾'} variant="text" onPress={() => setOpenHq((x) => (x === h.id ? null : h.id))} />
              </View>
              {openHq === h.id ? (
                <PagedList<HqRoute>
                  resetKey={h.id}
                  fetchPage={(p, q) => listHqRoutesPage(h.id, p, q)}
                  searchLabel="Search routes"
                  emptyText="This HQ has no active routes."
                  offlineText="Connect to the internet to see the routes."
                  renderItem={(r) => (
                    <InfoCard key={r.id}>
                      <ThemedText type="smallBold">{r.name}</ThemedText>
                    </InfoCard>
                  )}
                />
              ) : null}
            </View>
          ))}
        </CardSection>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  hq: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
