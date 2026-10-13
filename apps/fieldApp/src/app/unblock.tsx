import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, PersonDropdown, sym } from '@/components/ui-cards';
import { Accents, Spacing } from '@/constants/theme';
import { ApiError, NetworkError, apiPost } from '@/lib/api';
import { useOnline } from '@/offline';
import { useTeam } from '@/offline/team';

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Unblock (docs/mobile/dailyplan.md rule 8): a manager clears the block a missed daily report put on someone below them, with a
 * required reason — the reason, who and their role are kept as the audit trail. The employee starts with a clean slate. The phone
 * can't see who is blocked (no endpoint lists it for a manager), so the employee tells you; unblocking someone who isn't blocked
 * changes nothing. Needs a connection.
 */
export default function UnblockScreen() {
  const online = useOnline();
  const { team, loaded } = useTeam();

  // Opened from a person (their page, or a blocked row) it starts with them chosen.
  const preset = useLocalSearchParams<{ userId?: string }>().userId;
  const [userId, setUserId] = useState<string | null>(typeof preset === 'string' && preset !== '' ? preset : null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'warning'; text: string } | null>(null);

  const picked = team.find((t) => t.id === userId) ?? null;

  async function unblock() {
    if (!picked) return setMsg({ tone: 'warning', text: 'Pick the employee first.' });
    if (!reason.trim()) return setMsg({ tone: 'warning', text: 'Give the reason — it is kept with the unblock.' });
    setBusy(true);
    setMsg(null);
    try {
      await apiPost<null>(`/identity/users/${picked.id}/unblock`, { reason: reason.trim() }, { auth: true });
      setReason('');
      setMsg({ tone: 'success', text: `${picked.name} can work again. Days before now won’t block them again.` });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell
      title="Unblock"
      subtitle="Clear a block for a missed daily report"
      footer={<PrimaryButton label={picked ? `Unblock ${picked.name}` : 'Unblock'} loading={busy} disabled={!online || !picked} onPress={unblock} />}>
      <View style={[styles.banner, { backgroundColor: Accents.amber.bg, borderColor: Accents.amber.border }]}>
        <ThemedText type="smallBold">Blocked after a missed daily report</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
          A blocked employee can’t log or submit anything until you clear it. Pick them and say why.
        </ThemedText>
      </View>
      {!online ? <Notice tone="info">You’re offline. Connect to the internet to unblock someone.</Notice> : null}

      <CardSection icon={sym('person.2', 'groups')} accent="blue" title="Employee" count={team.length || undefined}>
        {team.length === 0 ? (
          <Notice tone="info">{loaded ? 'You have nobody in your team.' : 'Loading your team…'}</Notice>
        ) : (
          <PersonDropdown
            people={team.map((t) => ({ id: t.id, name: t.name, detail: [t.employeeCode, t.designation].filter(Boolean).join(' · ') }))}
            value={userId}
            onChange={(id) => {
              setUserId(id);
              setMsg(null);
            }}
            disabled={busy}
          />
        )}
      </CardSection>

      <CardSection icon={sym('text.bubble', 'chat')} accent="purple" title="Reason">
        <TextField
          label="Why are you unblocking them? (required)"
          value={reason}
          onChangeText={(t) => {
            setReason(t);
            setMsg(null);
          }}
          multiline
          maxLength={500}
          editable={!busy}
        />
        <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
          The reason, your name and your role are kept as the audit trail.
        </ThemedText>
      </CardSection>

      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: 2 },
  small: { fontSize: 12, lineHeight: 17 },
});
