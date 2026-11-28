import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadXlsx, type XlsxSheet } from '@/lib/xlsx';
import { formatWhen } from '@/offline/day';

import { Notice } from './notice';
import { ThemedText } from './themed-text';
import { Pill, SummaryStrip } from './ui-cards';

/**
 * The Reports screens' shared parts (2026-11-28): every report is a short list of compact rows with one "Excel" button, the same
 * everywhere, so each reads the same way and downloads exactly what it shows.
 */

/** "Excel ⤓": builds the sheet from what is on screen and hands it to the phone. Says where it went, or why it didn't. */
export function ExcelButton({ fileName, sheet, disabled }: { fileName: string; sheet: () => XlsxSheet; disabled?: boolean }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const done = await downloadXlsx(fileName, sheet());
      if (done) setNote({ ok: true, text: done });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t make the file. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.excelWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Download as Excel"
        disabled={busy || disabled}
        onPress={() => void run()}
        style={({ pressed }) => [styles.excel, { borderColor: Accents.green.border, backgroundColor: Accents.green.bg }, (pressed || disabled) && styles.dim]}>
        {busy ? <ActivityIndicator size="small" color={Accents.green.solid} /> : <ThemedText type="smallBold" style={{ color: Accents.green.solid }}>Excel ⤓</ThemedText>}
      </Pressable>
      {note ? (
        <ThemedText type="small" style={{ color: note.ok ? theme.textSecondary : theme.danger }} numberOfLines={2}>
          {note.text}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** One record: a bold title and a grey line on the left; a figure and a status pill on the right; a chevron when it opens. */
export function ReportRow({
  title,
  subtitle,
  value,
  pill,
  onPress,
}: {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  pill?: { text: string; accent: Accent } | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <View style={styles.grow}>
        <ThemedText type="smallBold" numberOfLines={1}>{title}</ThemedText>
        {subtitle ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{subtitle}</ThemedText> : null}
      </View>
      <View style={styles.right}>
        {value ? <ThemedText type="smallBold">{value}</ThemedText> : null}
        {pill ? <Pill text={pill.text} accent={pill.accent} /> : null}
      </View>
      {onPress ? <ThemedText type="smallBold" themeColor="textSecondary">›</ThemedText> : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, subtitle, value, pill?.text].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => pressed && styles.dim}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

type Loadable = { loading: boolean; error: string | null; stale: boolean; fetchedAt: string | null };

/**
 * A report: optional tiles, a header line (title, count, Excel), the rows, and the right message when there is nothing — still
 * loading, offline with nothing saved, or simply none this month. A saved copy says how old it is.
 */
export function ReportList<R>({
  title,
  rows,
  state,
  hasData,
  tiles,
  note,
  empty,
  render,
  fileName,
  sheet,
}: {
  title: string;
  rows: R[];
  state: Loadable;
  hasData: boolean;
  tiles?: { label: string; value: string | number; accent: Accent }[];
  note?: ReactNode;
  empty: string;
  render: (row: R, index: number) => ReactNode;
  fileName: string;
  sheet: () => XlsxSheet;
}) {
  return (
    <View style={styles.stack}>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.stale && state.fetchedAt && hasData ? <Notice tone="info">{`Showing the copy from ${formatWhen(state.fetchedAt)}.`}</Notice> : null}
      {tiles && hasData ? <SummaryStrip items={tiles} /> : null}
      {note}
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{`${title}${hasData ? ` · ${rows.length}` : ''}`}</ThemedText>
        <ExcelButton fileName={fileName} sheet={sheet} disabled={!hasData || rows.length === 0} />
      </View>
      {!hasData ? (
        state.loading ? (
          <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
        ) : (
          <Notice tone="info">Connect to the internet once to load this report.</Notice>
        )
      ) : rows.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">{empty}</ThemedText>
      ) : (
        <View style={styles.list}>{rows.map(render)}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.three },
  list: { gap: Spacing.two },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three },
  excelWrap: { alignItems: 'flex-end', gap: 4, maxWidth: 200 },
  excel: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2, minWidth: 84, alignItems: 'center' },
  dim: { opacity: 0.6 },
});
