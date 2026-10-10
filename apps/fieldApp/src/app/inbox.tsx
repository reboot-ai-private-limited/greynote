import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_MESSAGES, type InboxMessage } from '@/features/inbox-demo';
import { useSessionUser } from '@/lib/session';
import { nowMs } from '@/offline/day';
import { store } from '@/offline/store';

type Filter = 'ALL' | 'UNREAD';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNREAD', label: 'Unread' },
];

const agoText = (minutes: number) => {
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
};

/**
 * Inbox (Utility): messages for you. These are DEMO messages for preview — the server has no inbox yet — so they are
 * made up in the app (features/inbox-demo.ts). Which ones you have read is kept on this phone, per employee.
 */
export default function InboxScreen() {
  const theme = useTheme();
  const me = useSessionUser();
  const metaKey = `inbox:read:${me?.id ?? 'anon'}`;

  // Read ids are kept with the key they were read from, so another employee on a shared phone starts clean.
  const [readState, setReadState] = useState<{ key: string; ids: string[] } | null>(null);
  const read = new Set(readState?.key === metaKey ? readState.ids : []);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  // When the screen opened, so "35 min ago" stays steady while it is open.
  const [openedAt] = useState(nowMs);

  useEffect(() => {
    let alive = true;
    store
      .getMeta(metaKey)
      .then((raw) => {
        let ids: string[] = [];
        try {
          ids = raw ? (JSON.parse(raw) as string[]) : [];
        } catch {
          ids = [];
        }
        if (alive) setReadState({ key: metaKey, ids });
      })
      .catch(() => alive && setReadState({ key: metaKey, ids: [] }));
    return () => {
      alive = false;
    };
  }, [metaKey]);

  const save = (ids: string[]) => {
    setReadState({ key: metaKey, ids });
    void store.setMeta(metaKey, JSON.stringify(ids)).catch(() => undefined);
  };
  const markRead = (id: string) => {
    if (!read.has(id)) save([...read, id]);
  };
  const markAllRead = () => save(DEMO_MESSAGES.map((m) => m.id));

  const unread = DEMO_MESSAGES.filter((m) => !read.has(m.id));
  const shown = filter === 'UNREAD' ? unread : DEMO_MESSAGES;
  const open: InboxMessage | null = DEMO_MESSAGES.find((m) => m.id === openId) ?? null;
  const ago = (m: InboxMessage) => agoText(m.minutesAgo + Math.floor((nowMs() - openedAt) / 60000));

  if (open) {
    return (
      <ScreenShell title="Message">
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="primary">
            {open.kind}
          </ThemedText>
          <ThemedText type="subtitle">{open.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{`${open.from} · ${ago(open)}`}</ThemedText>
          <ThemedText type="default" style={styles.body}>
            {open.body}
          </ThemedText>
        </ThemedView>
        <PrimaryButton label="Back to inbox" onPress={() => setOpenId(null)} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Inbox">
      <Notice tone="info">These are demo messages for preview. Nothing here is sent by the server yet.</Notice>
      <ChoiceChips
        options={FILTERS.map((f) => ({ value: f.value, label: f.value === 'UNREAD' && unread.length > 0 ? `Unread (${unread.length})` : f.label }))}
        value={filter}
        onChange={setFilter}
      />
      {unread.length > 0 ? <PrimaryButton label="Mark all as read" variant="text" onPress={markAllRead} /> : null}

      {shown.length === 0 ? (
        <Notice tone="info">{filter === 'UNREAD' ? 'You have no unread messages.' : 'Your inbox is empty.'}</Notice>
      ) : (
        shown.map((m) => {
          const isRead = read.has(m.id);
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`${isRead ? '' : 'Unread. '}${m.title}, from ${m.from}`}
              onPress={() => (markRead(m.id), setOpenId(m.id))}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: isRead ? 'transparent' : theme.primary }]} />
                  <View style={styles.grow}>
                    <ThemedText type={isRead ? 'default' : 'smallBold'} numberOfLines={2}>
                      {m.title}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{`${m.kind} · ${m.from} · ${ago(m)}`}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {m.body}
                    </ThemedText>
                  </View>
                </View>
              </ThemedView>
            </Pressable>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  grow: { flex: 1, gap: Spacing.one },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  body: { marginTop: Spacing.two },
});
