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

/**
 * A small green download pill for a list's header: `run` makes the file (on the phone, or the server's own sheet) and hands it over;
 * the line under it says where it went, or why it didn't.
 */
export function DownloadButton({ run: make, label = '⤓ Excel', hint, disabled }: { run: () => Promise<string | null>; label?: string; hint?: string; disabled?: boolean }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const done = await make();
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
        accessibilityLabel={`Download ${label.replace(/⤓ ?| ?⤓/g, '')}${hint ? `, ${hint}` : ''}`}
        disabled={busy || disabled}
        onPress={() => void run()}
        style={({ pressed }) => [styles.excel, { borderColor: Accents.green.border, backgroundColor: Accents.green.bg }, (pressed || disabled) && styles.dim]}>
        {busy ? (
          <ActivityIndicator size="small" color={Accents.green.solid} />
        ) : (
          <>
            <ThemedText type="smallBold" style={{ color: Accents.green.solid }} numberOfLines={1}>{label}</ThemedText>
            {hint ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{hint}</ThemedText> : null}
          </>
        )}
      </Pressable>
      {note ? (
        <ThemedText type="small" style={{ color: note.ok ? theme.textSecondary : theme.danger }} numberOfLines={2}>
          {note.text}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** One file in a `DownloadsCard`: an XLS badge, the name and what it holds, and a Download pill (or why it can't be had yet). */
function DownloadRow({ title, about, run: make, unavailable, last }: { title: string; about: string; run: () => Promise<string | null>; unavailable?: string | null; last: boolean }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true);
    setNote(null);
    try {
      const done = await make();
      if (done) setNote({ ok: true, text: done });
    } catch (err) {
      setNote({ ok: false, text: err instanceof Error ? err.message : 'Couldn’t make the file. Try again.' });
    } finally {
      setBusy(false);
    }
  };
  const off = Boolean(unavailable);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Download ${title}, ${about}${unavailable ? `, ${unavailable}` : ''}`}
      accessibilityState={{ disabled: off || busy, busy }}
      disabled={off || busy}
      onPress={() => void run()}
      style={({ pressed }) => [styles.fileRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }, pressed && styles.dim]}>
      <View style={[styles.badge, { backgroundColor: off ? theme.backgroundElement : Accents.green.bg, borderColor: off ? theme.border : Accents.green.border }]}>
        <ThemedText type="smallBold" style={[styles.badgeText, { color: off ? theme.textSecondary : Accents.green.solid }]}>XLS</ThemedText>
      </View>
      <View style={[styles.grow, off && styles.dim]}>
        <ThemedText type="smallBold" numberOfLines={1}>{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{about}</ThemedText>
        {note ? (
          <ThemedText type="small" style={{ color: note.ok ? theme.textSecondary : theme.danger }} numberOfLines={2}>
            {note.text}
          </ThemedText>
        ) : null}
      </View>
      {off ? (
        <ThemedText type="small" themeColor="textSecondary">{unavailable}</ThemedText>
      ) : (
        <View style={[styles.pill, { backgroundColor: Accents.green.solid }]}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
          <ThemedText type="smallBold" style={styles.pillText}>{busy ? 'Making…' : '⤓ Download'}</ThemedText>
        </View>
      )}
    </Pressable>
  );
}

/**
 * The server's detailed Excel sheets as a list of files (2026-11-28): one card, one row each, an XLS badge and a Download pill, so it
 * reads as something to download. A row that can't be had yet is greyed and says why.
 */
export function DownloadsCard({ title = 'Downloads · Excel', files }: { title?: string; files: { key: string; title: string; about: string; run: () => Promise<string | null>; unavailable?: string | null }[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <View>
        {files.map((f, i) => (
          <DownloadRow key={f.key} title={f.title} about={f.about} run={f.run} unavailable={f.unavailable} last={i === files.length - 1} />
        ))}
      </View>
    </View>
  );
}

/** "⤓ Excel" for a list: builds the sheet on the phone from exactly the rows on screen. */
export function ExcelButton({ fileName, sheet, disabled }: { fileName: string; sheet: () => XlsxSheet; disabled?: boolean }) {
  return <DownloadButton run={() => downloadXlsx(fileName, sheet())} disabled={disabled} />;
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
  download,
}: {
  title: string;
  rows: R[];
  state: Loadable;
  hasData: boolean;
  tiles?: { label: string; value: string | number; accent: Accent }[];
  note?: ReactNode;
  empty: string;
  render: (row: R, index: number) => ReactNode;
  fileName?: string;
  sheet?: () => XlsxSheet;
  /** The server's own sheet for this report (the one Admin downloads), used instead of a phone-made one. */
  download?: () => Promise<string | null>;
}) {
  return (
    <View style={styles.stack}>
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      {state.stale && state.fetchedAt && hasData ? <Notice tone="info">{`Showing the copy from ${formatWhen(state.fetchedAt)}.`}</Notice> : null}
      {tiles && hasData ? <SummaryStrip items={tiles} /> : null}
      {note}
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.grow}>{`${title}${hasData ? ` · ${rows.length}` : ''}`}</ThemedText>
        {download ? (
          <DownloadButton run={download} disabled={!hasData} />
        ) : fileName && sheet ? (
          <ExcelButton fileName={fileName} sheet={sheet} disabled={!hasData || rows.length === 0} />
        ) : null}
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
  card: { borderWidth: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one, gap: Spacing.one },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, minHeight: 64 },
  badge: { width: 40, height: 46, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  pillText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18 },
});
