import { useFinancialYear } from '@/lib/financial-year';
import { FyBanner } from '@/components/fy-banner';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Avatar, InfoCard, Pill } from '@/components/ui-cards';
import { Accents, Spacing } from '@/constants/theme';
import { useTeamBoard } from '@/hooks/use-team-board';
import { ApiError, NetworkError, apiPost } from '@/lib/api';
import { useOnline } from '@/offline';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Unblock (docs/mobile/dailyplan.md rule 8): the people in your team who are blocked right now (a missed daily report blocks someone until you clear it), each with
 * its own Unblock and the required reason, which is kept with who and their role as the audit trail. Nobody blocked: it says so. Needs a connection.
 */
export default function UnblockScreen() {
  const fy = useFinancialYear();
  const online = useOnline();
  const board = useTeamBoard();
  // Opened from a person (a blocked row on the Team board), it shows just them.
  const preset = useLocalSearchParams<{ userId?: string }>().userId;
  const only = typeof preset === 'string' && preset !== '' ? preset : null;
  const [openId, setOpenId] = useState<string | null>(only);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  const blocked = [...board.byId.values()]
    .filter((n) => n.day?.blocked === true && !done.has(n.member.id) && (only === null || n.member.id === only))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));

  async function unblock(id: string, name: string) {
    if (!reason.trim()) return setMsg({ tone: 'warning', text: 'Give the reason: it is kept with the unblock.' });
    setBusy(true);
    setMsg(null);
    try {
      await apiPost<null>(`/identity/users/${id}/unblock`, { reason: reason.trim() }, { auth: true });
      setDone((d) => new Set(d).add(id));
      setReason('');
      setOpenId(null);
      setMsg({ tone: 'success', text: `${name} can work again. Days before now won’t block them again.` });
      board.reload();
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell title="Unblock" subtitle="People blocked after a missed daily report" onRefresh={board.reload} refreshing={board.refreshing}>
      <FyBanner />
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to unblock someone.</Notice> : null}
      {board.error && online ? <Notice tone="danger">{board.error}</Notice> : null}
      {board.loading ? <Skeleton cards={2} lines={2} /> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {!board.loading && blocked.length === 0 ? <Notice tone="info">{only ? 'This person is not blocked.' : 'Nobody in your team is blocked.'}</Notice> : null}
      {blocked.length > 0 ? (
        <View style={[styles.banner, { backgroundColor: Accents.amber.bg, borderColor: Accents.amber.border }]}>
          <ThemedText type="smallBold">{`${blocked.length} blocked`}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">A blocked employee can’t log or submit anything until you clear it. Say why.</ThemedText>
        </View>
      ) : null}

      {blocked.map((n) => {
        const open = openId === n.member.id;
        return (
          <InfoCard key={n.member.id}>
            <View style={styles.row}>
              <Avatar name={n.member.name} accent="red" size={40} />
              <View style={styles.grow}>
                <ThemedText type="smallBold" numberOfLines={1}>{n.member.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{[n.member.employeeCode, n.member.designation].filter(Boolean).join(' · ')}</ThemedText>
              </View>
              <Pill text="Blocked" accent="red" />
            </View>
            {open ? (
              <>
                <TextField label="Why are you unblocking them? (required)" value={reason} onChangeText={(t) => { setReason(t); setMsg(null); }} multiline maxLength={500} editable={!busy} />
                <ThemedText type="small" themeColor="textSecondary">The reason, your name and your role are kept as the audit trail.</ThemedText>
                <PrimaryButton label={`Unblock ${n.member.name}`} loading={busy} disabled={!online || fy.isPast} onPress={() => void unblock(n.member.id, n.member.name)} />
                <PrimaryButton label="Cancel" variant="text" disabled={busy} onPress={() => setOpenId(null)} />
              </>
            ) : (
              <PrimaryButton label="Unblock…" variant="text" disabled={fy.isPast} onPress={() => { setOpenId(n.member.id); setMsg(null); }} style={styles.link} />
            )}
          </InfoCard>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, gap: 2 },
  link: { alignSelf: 'flex-start' },
});
