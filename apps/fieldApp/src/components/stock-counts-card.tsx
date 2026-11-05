import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { formatRupees } from '@/lib/money';
import { STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, type StockCountsMonth } from '@/lib/stock-counts';

import { Notice } from './notice';
import { ThemedText } from './themed-text';
import { Pill } from './ui-cards';

/** A month of an employee's distributor counts, distributor by distributor, with what each works out to at PTS. Read only. */
export function StockCountsCard({ data }: { data: StockCountsMonth }) {
  if (data.distributors.length === 0) return <Notice tone="info">No distributor counts for this month.</Notice>;
  return (
    <View style={styles.stack}>
      {data.distributors.map((d) => (
        <View key={d.distributorId} style={styles.stack}>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.grow}>{d.name}</ThemedText>
            <Pill text={STOCK_COUNT_STATUS_TEXT[d.status]} accent={STOCK_COUNT_STATUS_ACCENT[d.status]} />
          </View>
          {d.lines.map((l) => (
            <View key={l.product.id} style={styles.line}>
              <View style={styles.grow}>
                <ThemedText type="small">{l.product.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`Opening ${l.openingQty} · Delivered ${l.deliveredQty} · Closing ${l.closingQty} · Secondary ${l.secondaryQty ?? '—'}`}
                </ThemedText>
              </View>
              <ThemedText type="small">{l.secondaryAmountPaise === null ? '—' : formatRupees(l.secondaryAmountPaise)}</ThemedText>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
});
