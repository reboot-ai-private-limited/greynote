import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { SampleBalanceRow } from '@/lib/sample-requests';

import { ThemedText } from './themed-text';

/**
 * Samples or LBL per product: asked for, credited ("got"), given to doctors and what is left. Left can be below zero because a call never checks a
 * balance; it is shown in red so a manager can see someone gave more than they were credited.
 */
export function SampleMatrix({ rows, empty }: { rows: SampleBalanceRow[]; empty: string }) {
  if (rows.length === 0) return <ThemedText type="small" themeColor="textSecondary">{empty}</ThemedText>;
  return (
    <View style={styles.table}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.name}>Product</ThemedText>
        {['Asked', 'Got', 'Gave', 'Left'].map((h) => (
          <ThemedText key={h} type="smallBold" style={styles.num}>{h}</ThemedText>
        ))}
      </View>
      {rows.map((r) => (
        <View key={r.productId} style={styles.row}>
          <ThemedText type="small" style={styles.name}>{r.productName}</ThemedText>
          <ThemedText type="small" style={styles.num}>{r.requested}</ThemedText>
          <ThemedText type="small" style={styles.num}>{r.credited}</ThemedText>
          <ThemedText type="small" style={styles.num}>{r.given}</ThemedText>
          <ThemedText type="smallBold" themeColor={r.left < 0 ? 'danger' : 'text'} style={styles.num}>{r.left}</ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  name: { flex: 1 },
  num: { width: 48, textAlign: 'right' },
});
