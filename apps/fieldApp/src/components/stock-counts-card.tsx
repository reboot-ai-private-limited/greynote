import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRupees } from '@/lib/money';
import type { SecondaryAttachment } from '@/lib/sales';
import { STOCK_COUNT_STATUS_ACCENT, STOCK_COUNT_STATUS_TEXT, adjustedNote, type StockCountsMonth } from '@/lib/stock-counts';

import { Notice } from './notice';
import { ThemedText } from './themed-text';
import { Pill } from './ui-cards';

/** The proof files of a month: a thumbnail for a picture, a PDF tile for a document. Tapping opens the file. */
export function ProofFiles({ files }: { files: SecondaryAttachment[] }) {
  const theme = useTheme();
  if (files.length === 0) return <ThemedText type="small" themeColor="textSecondary">No proof file attached.</ThemedText>;
  return (
    <View style={styles.files}>
      {files.map((f) => (
        <Pressable key={f.id} accessibilityLabel={`Open ${f.fileName}`} onPress={() => void Linking.openURL(f.url)}>
          {f.mimeType.startsWith('image/') ? (
            <Image source={{ uri: f.url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.doc, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{f.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}</ThemedText>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A month of an employee's secondary stock, distributor by distributor, with the value at PTS and the proof files. Read only.
 * A row whose opening or primary differs from its default is flagged, so the manager sees it was corrected.
 */
export function StockCountsCard({ data }: { data: StockCountsMonth }) {
  // A row that was saved and then cleared back to zeros (a removed medicine) says nothing, so it is left out.
  const counted = (l: StockCountsMonth['distributors'][number]['lines'][number]) => l.saved && (l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0);
  const shown = data.distributors.filter((d) => d.lines.some(counted));
  return (
    <View style={styles.stack}>
      <ThemedText type="smallBold">Proof files</ThemedText>
      <ProofFiles files={data.attachments} />
      {shown.length === 0 ? <Notice tone="info">No secondary stock entered for this month.</Notice> : null}
      {shown.map((d) => (
        <View key={d.distributorId} style={styles.stack}>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.grow}>{d.name}</ThemedText>
            <Pill text={STOCK_COUNT_STATUS_TEXT[d.status]} accent={STOCK_COUNT_STATUS_ACCENT[d.status]} />
          </View>
          {d.lines
            .filter(counted)
            .map((l) => (
              <View key={l.product.id} style={styles.line}>
                <View style={styles.grow}>
                  <ThemedText type="small">{l.product.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {`Opening ${l.openingQty}${l.openingEdited ? ' (edited)' : ''} · Primary ${l.primaryQty}${l.primaryEdited ? ' (edited)' : ''} · Secondary ${l.issuedQty} · Closing ${l.closingQty}`}
                  </ThemedText>
                  {adjustedNote(l) ? <ThemedText type="small" themeColor="warning">{adjustedNote(l)}</ThemedText> : null}
                </View>
                <ThemedText type="small">{l.issuedAmountPaise === null ? '—' : formatRupees(l.issuedAmountPaise)}</ThemedText>
              </View>
            ))}
          <ThemedText type="small" themeColor="textSecondary">
            {`Total secondary ${d.totals.issuedQty} units · ${formatRupees(d.totals.issuedAmountPaise)}`}
          </ThemedText>
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
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 56, height: 56, borderRadius: Spacing.two },
  doc: { alignItems: 'center', justifyContent: 'center' },
});
