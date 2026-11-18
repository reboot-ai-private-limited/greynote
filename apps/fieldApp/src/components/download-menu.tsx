import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Accents, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { deliverCsv } from '@/lib/csv';
import { useOnline } from '@/offline';

import { Notice } from './notice';
import { PrimaryButton } from './primary-button';
import { RowCard, sym } from './ui-cards';

/** What one download makes: the file, or the reason there is nothing to download (shown instead of failing). */
export type DownloadResult = { fileName: string; csv: string; title: string } | { empty: string } | { delivered: string | null };
export type DownloadItem = {
  key: string;
  label: string;
  hint?: string;
  /** Known before tapping (no Tour Plan for the month): the row is greyed and says why. */
  disabledReason?: string | null;
  build: () => Promise<DownloadResult>;
};

const ARROW = sym('arrow.down.circle.fill', 'download');
const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError || err instanceof Error ? err.message : 'Couldn’t make the file. Please try again.';

/**
 * One **Download** button. With a single file it makes it at once; with several it opens a short list (Tour Plan, Daily plans, Expenses…). Each file is a CSV,
 * built when tapped from live data (so it needs a connection) and handed over through the usual Open / Share / Download choice.
 */
export function DownloadMenu({ items, label = 'Download' }: { items: DownloadItem[]; label?: string }) {
  const online = useOnline();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);

  const run = async (item: DownloadItem) => {
    setBusy(item.key);
    setMsg(null);
    try {
      const made = await item.build();
      if ('empty' in made) setMsg({ tone: 'info', text: made.empty });
      else if ('delivered' in made) {
        // The item handed the file over itself (an Excel workbook from the server).
        if (made.delivered) setMsg({ tone: 'info', text: made.delivered });
        setOpen(false);
      } else {
        const done = await deliverCsv(made.fileName, made.csv, made.title);
        if (done) setMsg({ tone: 'info', text: done });
        setOpen(false);
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(null);
    }
  };

  const press = () => {
    if (items.length === 1) void run(items[0]!);
    else setOpen((o) => !o);
  };

  return (
    <View style={styles.stack}>
      <PrimaryButton label={busy ? 'Preparing…' : open ? `${label} ▴` : items.length > 1 ? `${label} ▾` : label} disabled={!online || busy !== null || (items.length === 1 && !!items[0]!.disabledReason)} onPress={press} />
      {!online ? <Notice tone="info">Connect to the internet to download.</Notice> : null}
      {items.length === 1 && items[0]!.disabledReason ? <Notice tone="info">{items[0]!.disabledReason}</Notice> : null}
      {open && items.length > 1
        ? items.map((i) => (
            <View key={i.key} style={i.disabledReason ? styles.off : undefined}>
              <RowCard
                icon={sym('doc.text', 'description')}
                accent="indigo"
                title={i.label}
                subtitle={i.disabledReason ?? i.hint ?? 'CSV'}
                right={busy === i.key ? <ActivityIndicator color={theme.primary} /> : <SymbolView name={ARROW} size={26} tintColor={i.disabledReason ? theme.textSecondary : Accents.blue.solid} />}
                onPress={i.disabledReason || busy !== null ? undefined : () => void run(i)}
              />
            </View>
          ))
        : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: Spacing.two },
  off: { opacity: 0.5 },
});
