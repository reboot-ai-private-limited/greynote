import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRupees } from '@/lib/money';
import { formatSize } from '@/lib/proof-picker';
import type { SecondaryAttachment } from '@/lib/sales';
import { STOCK_COUNT_STATUS_TEXT, adjustedNote, type StockCountsMonth } from '@/lib/stock-counts';

import { Notice } from './notice';
import { ThemedText } from './themed-text';
import { CollapsibleSection, SummaryStrip, sym } from './ui-cards';

/** The proof files of a month as a grid: a thumbnail for a picture, a PDF tile for a document, the name and size under each. Tap to open. */
export function ProofFiles({ files }: { files: SecondaryAttachment[] }) {
  const theme = useTheme();
  if (files.length === 0) return <ThemedText type="small" themeColor="textSecondary">No proof file attached.</ThemedText>;
  return (
    <View style={styles.files}>
      {files.map((f) => (
        <Pressable key={f.id} accessibilityRole="link" accessibilityLabel={`Open ${f.fileName}`} onPress={() => void Linking.openURL(f.url)} style={styles.tile}>
          {f.mimeType.startsWith('image/') ? (
            <Image source={{ uri: f.url }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.doc, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">{f.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}</ThemedText>
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{f.fileName}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{formatSize(f.sizeBytes)}</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A month of an employee's secondary, read only, laid out like the MR's own Secondary Sales screen (2026-11-28): three tiles, then one
 * card per distributor (closed until tapped) with the same compact product rows, then the proof files. A row whose opening or primary
 * differs from its default says "(edited)", so the manager sees it was corrected.
 */
export function StockCountsCard({ data }: { data: StockCountsMonth }) {
  const theme = useTheme();
  // A row that was saved and then cleared back to zeros (a removed medicine) says nothing, so it is left out.
  const counted = (l: StockCountsMonth['distributors'][number]['lines'][number]) => l.saved && (l.openingQty > 0 || l.primaryQty > 0 || l.issuedQty > 0);
  const shown = data.distributors.filter((d) => d.lines.some(counted));
  return (
    <View style={styles.stack}>
      <SummaryStrip
        items={[
          { label: 'Secondary value', value: formatRupees(data.totals.issuedAmountPaise), accent: 'green' },
          { label: 'Units', value: data.totals.issuedQty, accent: 'blue' },
          { label: 'Distributors', value: shown.length, accent: 'teal' },
        ]}
      />
      {shown.length === 0 ? <Notice tone="info">No secondary entered for this month.</Notice> : null}
      {shown.map((d) => {
        const lines = d.lines.filter(counted);
        return (
          <CollapsibleSection
            key={d.distributorId}
            icon={sym('building.2', 'store')}
            accent="blue"
            title={d.name}
            count={lines.length}
            summary={`${d.totals.issuedQty} units · ${formatRupees(d.totals.issuedAmountPaise)} · ${STOCK_COUNT_STATUS_TEXT[d.status]}`}
            alert={d.status === 'REJECTED' ? STOCK_COUNT_STATUS_TEXT[d.status] : null}>
            {lines.map((l) => (
              <View key={l.product.id} style={[styles.product, { borderColor: theme.border }]}>
                <View style={styles.head}>
                  <ThemedText type="smallBold" style={styles.grow} numberOfLines={1}>{l.product.name}</ThemedText>
                  <ThemedText type="smallBold">{l.issuedAmountPaise === null ? 'no PTS' : formatRupees(l.issuedAmountPaise)}</ThemedText>
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {`Opening ${l.openingQty}${l.openingEdited ? ' (edited)' : ''} · Primary ${l.primaryQty}${l.primaryEdited ? ' (edited)' : ''} · Secondary ${l.issuedQty} · Closing ${l.closingQty}`}
                </ThemedText>
                {adjustedNote(l) ? <ThemedText type="small" themeColor="warning">{adjustedNote(l)}</ThemedText> : null}
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {`Total: opening ${d.totals.openingQty} · primary ${d.totals.primaryQty} · secondary ${d.totals.issuedQty} · closing ${d.totals.closingQty}`}
            </ThemedText>
          </CollapsibleSection>
        );
      })}
      <ThemedText type="smallBold">{`Proof files${data.attachments.length ? ` (${data.attachments.length})` : ''}`}</ThemedText>
      <ProofFiles files={data.attachments} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1 },
  product: { gap: Spacing.one, borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { width: 96, gap: 2 },
  thumb: { width: 96, height: 96, borderRadius: Spacing.two },
  doc: { alignItems: 'center', justifyContent: 'center' },
});
