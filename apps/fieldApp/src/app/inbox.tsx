import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { IconChip, InfoCard, Pill, SummaryStrip, sym } from '@/components/ui-cards';
import { Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError, NetworkError } from '@/lib/api';
import { KIND_LABEL, listInbox, markAllInboxRead, markInboxRead, queueRead, type InboxItem, type InboxKind } from '@/lib/inbox';
import { useSessionUser } from '@/lib/session';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen, nowMs } from '@/offline/day';

type Filter = 'ALL' | 'UNREAD';

const KIND_STYLE: Record<InboxKind, { accent: Accent; icon: ReturnType<typeof sym> }> = {
  ANNOUNCEMENT: { accent: 'blue', icon: sym('megaphone', 'campaign') },
  REMINDER: { accent: 'amber', icon: sym('bell', 'notifications') },
  POLICY: { accent: 'purple', icon: sym('doc.text', 'description') },
  UPDATE: { accent: 'green', icon: sym('arrow.triangle.2.circlepath', 'update') },
};

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/** "Today", "Yesterday" or the date, in the phone's calendar (the exact time is on the message). */
const sentText = (iso: string) => {
  const sent = new Date(iso);
  if (Number.isNaN(sent.getTime())) return iso;
  const dayOf = (d: Date) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
  const diff = dayOf(new Date(nowMs())) - dayOf(sent);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return sent.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

/**
 * Inbox (Utility, docs/mobile/inbox.md): messages the Admin sent you. The server decides what is in your inbox and what is
 * read; opening a message tells it. Offline you see the last list, and a read made offline is sent when you are back.
 */
export default function InboxScreen() {
  const theme = useTheme();
  const online = useOnline();
  const me = useSessionUser();
  const [tick, setTick] = useState(0);
  const list = useCachedFetch<InboxItem[]>('inbox', listInbox, tick);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  // Ids read here this session, so the dot goes at once without waiting for the next fetch.
  const [readHere, setReadHere] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const items = (list.data ?? []).map((m) => (readHere.includes(m.id) ? { ...m, read: true } : m));
  const unread = items.filter((m) => !m.read);
  const shown = filter === 'UNREAD' ? unread : items;
  const open = items.find((m) => m.id === openId) ?? null;

  const markRead = async (m: InboxItem) => {
    if (m.read) return;
    setReadHere((ids) => [...ids, m.id]);
    if (!online) return void (me && queueRead(me.id, m.id));
    try {
      await markInboxRead(m.id);
    } catch (err) {
      // A message taken back meanwhile (404) just goes on the next fetch; anything else is kept to send later.
      if (me && !(err instanceof ApiError && err.status === 404)) void queueRead(me.id, m.id);
    }
  };

  const markAll = async () => {
    setMsg(null);
    setReadHere(items.map((m) => m.id));
    try {
      await markAllInboxRead();
      setTick((t) => t + 1);
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    }
  };

  if (open) {
    const style = KIND_STYLE[open.kind];
    return (
      <ScreenShell title="Message" footer={<PrimaryButton label="Back to inbox" variant="text" onPress={() => setOpenId(null)} />}>
        <InfoCard>
          <View style={styles.head}>
            <IconChip icon={style.icon} accent={style.accent} />
            <View style={styles.grow}>
              <Pill text={KIND_LABEL[open.kind]} accent={style.accent} />
              <ThemedText type="small" themeColor="textSecondary">{formatWhen(open.sentAt)}</ThemedText>
            </View>
          </View>
          <ThemedText type="subtitle">{open.title}</ThemedText>
          <ThemedText type="default" style={styles.body}>{open.body}</ThemedText>
          {open.expiresAt ? <ThemedText type="small" themeColor="textSecondary">{`Until ${formatWhen(open.expiresAt)}`}</ThemedText> : null}
        </InfoCard>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Inbox" subtitle="Messages from your company" onRefresh={() => setTick((t) => t + 1)} refreshing={list.refreshing}>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {list.stale && list.fetchedAt && list.data ? <Notice tone="info">{`Showing the list from ${formatWhen(list.fetchedAt)}.`}</Notice> : null}
      {list.error && online && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
      <SummaryStrip
        items={[
          { label: 'Unread', value: String(unread.length).padStart(2, '0'), accent: 'blue' },
          { label: 'Messages', value: String(items.length).padStart(2, '0'), accent: 'purple' },
        ]}
      />
      <View style={styles.head}>
        <View style={styles.grow}>
          <ChoiceChips
            options={[{ value: 'ALL' as const, label: 'All' }, { value: 'UNREAD' as const, label: unread.length > 0 ? `Unread (${unread.length})` : 'Unread' }]}
            value={filter}
            onChange={setFilter}
          />
        </View>
        {unread.length > 0 ? <PrimaryButton label="Mark all as read" variant="text" onPress={markAll} /> : null}
      </View>

      {list.loading && !list.data ? (
        <Skeleton cards={3} lines={3} />
      ) : shown.length === 0 ? (
        <Notice tone="info">{filter === 'UNREAD' ? 'You have no unread messages.' : list.data ? 'No messages.' : 'Connect once to load your messages.'}</Notice>
      ) : (
        shown.map((m) => {
          const style = KIND_STYLE[m.kind];
          return (
            <View key={m.id}>
              <InfoCard>
                <View style={styles.head}>
                  <IconChip icon={style.icon} accent={style.accent} />
                  <View style={styles.grow}>
                    <ThemedText type={m.read ? 'default' : 'smallBold'} numberOfLines={2}>{m.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{`${KIND_LABEL[m.kind]} · ${sentText(m.sentAt)}`}</ThemedText>
                  </View>
                  {m.read ? null : <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
                </View>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{m.body}</ThemedText>
                <View style={styles.actions}>
                  <PrimaryButton label="Read →" variant="text" onPress={() => (void markRead(m), setOpenId(m.id))} />
                </View>
              </InfoCard>
            </View>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: Spacing.one },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { marginTop: Spacing.one },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
