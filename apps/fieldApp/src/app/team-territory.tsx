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
import { getTeamTerritory, listHqRoutesPage, type HqRoute, type TeamHq, type TeamZone } from '@/lib/team-visibility';
import { useOnline } from '@/offline';

/**
 * Team → Territory (managers): your zones and HQs, worked out from where your team works and what you own. Tap an HQ for its routes,
 * searched a page at a time (a ZSM or the NSM never loads every route).
 */
export default function TeamTerritoryScreen() {
  const online = useOnline();
  const [zones, setZones] = useState<TeamZone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hq, setHq] = useState<TeamHq | null>(null);

  useEffect(() => {
    if (!online) return;
    getTeamTerritory()
      .then((z) => {
        setZones(z);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof ApiError || err instanceof NetworkError ? err.message : 'Could not load your territory.'));
  }, [online]);

  if (hq) {
    return (
      <ScreenShell title={hq.name} subtitle="Routes of this HQ">
        <PrimaryButton label="← All HQs" variant="text" onPress={() => setHq(null)} style={styles.back} />
        <PagedList<HqRoute>
          resetKey={hq.id}
          fetchPage={(p, s) => listHqRoutesPage(hq.id, p, s)}
          searchLabel="Search routes"
          emptyText="This HQ has no active routes."
          offlineText="Connect to the internet to see the routes."
          renderItem={(r) => (
            <InfoCard key={r.id}>
              <ThemedText type="smallBold">{r.name}</ThemedText>
            </InfoCard>
          )}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Territory" subtitle="Zones and HQs of your team">
      {!online ? <Notice tone="info">Connect to the internet to see your territory.</Notice> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {online && !zones && !error ? <Skeleton cards={2} lines={2} /> : null}
      {zones && zones.length === 0 ? <Notice tone="info">Nobody in your team has an HQ yet, and you own none.</Notice> : null}
      {(zones ?? []).map((z) => (
        <CardSection key={z.id} icon={sym('map', 'map')} accent="teal" title={z.name} count={z.hqs.length}>
          {z.hqs.map((h) => (
            <View key={h.id} style={styles.hq}>
              <View style={styles.grow}>
                <ThemedText type="smallBold">{h.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {h.members} {h.members === 1 ? 'person' : 'people'}
                </ThemedText>
              </View>
              {h.owned ? <Pill text="Owned" accent="green" /> : null}
              <PrimaryButton label="Routes →" variant="text" onPress={() => setHq(h)} />
            </View>
          ))}
        </CardSection>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hq: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  back: { alignSelf: 'flex-start' },
});
