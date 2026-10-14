import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export type CardField = { label: string; value: ReactNode };

type Props<R> = {
  rows: R[];
  rowKey: (row: R, index: number) => string;
  /** The bold line at the top-left of each card (a date, a product…). */
  title: (row: R) => string;
  /** The top-right of each card (a status pill, an amount). */
  right?: (row: R) => ReactNode;
  /** The labelled lines under the title: a small grey label, then its value. An empty value leaves the line out. */
  fields?: (row: R) => CardField[];
  onRowPress?: (row: R) => void;
  /** A summary box under the cards: label and value per line (the totals). */
  totals?: CardField[];
};

/**
 * A report as a list of cards: one card per record with its title, something on the right, and labelled lines under it, then an
 * optional summary box for the totals. Every figure says what it is, so a card reads on its own with no table header to look up.
 */
export function ReportCards<R>({ rows, rowKey, title, right, fields, onRowPress, totals }: Props<R>) {
  const theme = useTheme();

  const value = (content: ReactNode) =>
    typeof content === 'string' || typeof content === 'number' ? (
      <ThemedText type="small" style={[styles.value, styles.valueText]}>
        {content}
      </ThemedText>
    ) : (
      <View style={[styles.value, styles.valueBox]}>{content}</View>
    );

  return (
    <View style={styles.list}>
      {rows.map((r, i) => {
        const lines = (fields?.(r) ?? []).filter((f) => f.value !== '' && f.value !== null && f.value !== undefined);
        const card = (
          <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.head}>
              <ThemedText type="smallBold" style={styles.title} numberOfLines={2}>
                {title(r)}
              </ThemedText>
              {right ? <View style={styles.right}>{right(r)}</View> : null}
            </View>
            {lines.length > 0 ? (
              <View style={[styles.lines, { borderTopColor: theme.border }]}>
                {lines.map((f) => (
                  <View key={f.label} style={styles.line}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                      {f.label}
                    </ThemedText>
                    {value(f.value)}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
        return onRowPress ? (
          <Pressable key={rowKey(r, i)} accessibilityRole="button" onPress={() => onRowPress(r)}>
            {card}
          </Pressable>
        ) : (
          <View key={rowKey(r, i)}>{card}</View>
        );
      })}

      {totals && totals.length > 0 ? (
        <View style={[styles.totals, { backgroundColor: theme.backgroundElement }]}>
          {totals.map((t) => (
            <View key={t.label} style={styles.line}>
              <ThemedText type="smallBold" style={styles.totalLabel}>
                {t.label}
              </ThemedText>
              {typeof t.value === 'string' || typeof t.value === 'number' ? (
                <ThemedText type="smallBold" style={styles.totalValue}>
                  {t.value}
                </ThemedText>
              ) : (
                <View>{t.value}</View>
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1 },
  right: { alignItems: 'flex-end' },
  lines: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  // Label on the left (it may wrap), value on the right edge: the same shape as the totals box under the cards.
  label: { flex: 1 },
  value: { flexShrink: 1, maxWidth: '60%' },
  valueText: { textAlign: 'right' },
  valueBox: { alignItems: 'flex-end' },
  totalLabel: { flex: 1 },
  totalValue: { textAlign: 'right' },
  totals: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
