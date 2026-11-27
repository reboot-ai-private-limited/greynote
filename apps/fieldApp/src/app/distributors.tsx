import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { NumberedRow } from '@/components/numbered-row';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InfoCard } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { placeName } from '@/lib/places';
import { useCachedSource } from '@/offline/cache';
import { formatWhen } from '@/offline/day';
import type { FieldMasterDataSnapshot, TerritorySnapshot } from '@/types/sync';

/**
 * Distributors (decision-log 2026-11-19): the ones handed to you, read from the last field master data pull so it works offline, with a search over the name,
 * place, contact person, mobile, GST and the routes they serve. A manager's team's distributors are one tap away (they are searched on the server there).
 */
export default function DistributorsScreen() {
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const territory = useCachedSource<TerritorySnapshot>('territory');
  const { isManager } = useCurrentUser();
  const [query, setQuery] = useState('');

  // The places a distributor serves (2026-11-27), by name where this phone knows them; an older server's routes as a fallback.
  const routeName = new Map((territory.data?.routes ?? []).map((r) => [r.id, r.name]));
  const q = query.trim().toLowerCase();
  const rows = [...(master.data?.distributors ?? [])]
    .map((d) => ({
      d,
      routes: (d.placeIds && d.placeIds.length > 0
        ? d.placeIds.map((id) => placeName(id, territory.data))
        : d.routeIds.map((id) => routeName.get(id))
      ).filter((n): n is string => Boolean(n)),
    }))
    .filter(({ d, routes }) => !q || [d.name, d.address, d.contactPerson, d.mobile, d.gstNumber, ...routes].some((v) => (v ?? '').toLowerCase().includes(q)))
    .sort((a, b) => a.d.name.localeCompare(b.d.name));

  return (
    <ScreenShell title="Distributors" subtitle={isManager ? 'Yours, and your team’s' : 'The distributors handed to you'}>
      <TextField label="Search" placeholder="Name, place, contact, mobile or GST" value={query} onChangeText={setQuery} autoCapitalize="none" />
      {isManager ? <PrimaryButton label="Team distributors →" variant="text" onPress={() => router.push('/team-distributors')} /> : null}
      {master.fetchedAt ? <ThemedText type="small" themeColor="textSecondary">{`As of ${formatWhen(master.fetchedAt)}.`}</ThemedText> : null}

      {!master.loaded ? (
        <Notice tone="info">Loading…</Notice>
      ) : !master.data ? (
        <Notice tone="info">Connect once to load your distributors.</Notice>
      ) : rows.length === 0 ? (
        <Notice tone="info">{q ? 'No distributor matches your search.' : 'No distributor has been handed to you yet. Ask your manager or Admin.'}</Notice>
      ) : (
        rows.map(({ d, routes }, i) => (
          <NumberedRow key={d.id} n={i + 1}>
            <InfoCard>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              {d.address ? <ThemedText type="small" themeColor="textSecondary">{d.address}</ThemedText> : null}
              {[d.contactPerson, d.gstNumber ? `GST ${d.gstNumber}` : null].filter(Boolean).length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">{[d.contactPerson, d.gstNumber ? `GST ${d.gstNumber}` : null].filter(Boolean).join(' · ')}</ThemedText>
              ) : null}
              {routes.length > 0 ? <ThemedText type="small" themeColor="textSecondary">{`${d.placeIds && d.placeIds.length > 0 ? 'Places' : 'Routes'}: ${routes.join(', ')}`}</ThemedText> : null}
              {d.mobile ? (
                <View style={styles.row}>
                  <PrimaryButton label={d.mobile} variant="text" onPress={() => void Linking.openURL(`tel:${d.mobile}`)} />
                </View>
              ) : null}
            </InfoCard>
          </NumberedRow>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Spacing.two } });
