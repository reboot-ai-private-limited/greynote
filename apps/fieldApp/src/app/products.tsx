import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatRupees } from '@/lib/money';
import { useCachedSource } from '@/offline/cache';
import { formatWhen } from '@/offline/day';
import type { FieldMasterDataSnapshot } from '@/types/sync';

const PRICES = [
  { key: 'mrpPaise', label: 'MRP' },
  { key: 'ptrPaise', label: 'PTR' },
  { key: 'ptsPaise', label: 'PTS' },
] as const;

/**
 * Products: the active catalog with its prices (MRP, PTR, PTS), read from the last field master data pull, so it
 * works offline. A product saved before prices were added (2026-10) shows "—" until Admin sets them on the web.
 */
export default function ProductsScreen() {
  const master = useCachedSource<FieldMasterDataSnapshot>('fieldMasterData');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const products = [...(master.data?.products ?? [])]
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <ScreenShell title="Products">
      <TextField label="Search" placeholder="Product name or SKU" value={query} onChangeText={setQuery} />
      {master.fetchedAt ? (
        <ThemedText type="small" themeColor="textSecondary">{`Prices as of ${formatWhen(master.fetchedAt)}.`}</ThemedText>
      ) : null}

      {!master.loaded ? (
        <Notice tone="info">Loading…</Notice>
      ) : !master.data ? (
        <Notice tone="info">Connect once to load the products.</Notice>
      ) : products.length === 0 ? (
        <Notice tone="info">{q ? 'No product matches your search.' : 'No products yet.'}</Notice>
      ) : (
        products.map((p) => (
          <ThemedView key={p.id} type="backgroundElement" style={styles.card}>
            <View style={styles.title}>
              <ThemedText type="smallBold">{p.name}</ThemedText>
              {p.packSize ? <ThemedText type="small" themeColor="textSecondary">{p.packSize}</ThemedText> : null}
            </View>
            <View style={styles.prices}>
              {PRICES.map(({ key, label }) => (
                <View key={key} style={styles.price}>
                  <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
                  <ThemedText type="smallBold">{p[key] != null ? formatRupees(p[key]) : '—'}</ThemedText>
                </View>
              ))}
            </View>
          </ThemedView>
        ))
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  title: { gap: Spacing.half },
  prices: { flexDirection: 'row', gap: Spacing.two },
  price: { flex: 1, gap: Spacing.half },
});
