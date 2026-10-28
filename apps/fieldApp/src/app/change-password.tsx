import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenShell } from '@/components/screen-shell';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { CardSection, sym } from '@/components/ui-cards';
import { Spacing } from '@/constants/theme';
import { ApiError, NetworkError } from '@/lib/api';
import { changePassword } from '@/lib/auth';
import { useOnline } from '@/offline';

const MIN_LENGTH = 8;
/** The server refuses a password over 72 bytes. */
const MAX_BYTES = 72;

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

type Problems = Partial<Record<'current' | 'next' | 'confirm', string>>;

/**
 * Change password (docs/mobile/account.md): current password, new password, and the new one again. This phone stays signed in; the
 * employee's other sessions are signed out by the server. Needs a connection. A forgotten password still goes to Admin.
 */
export default function ChangePasswordScreen() {
  const online = useOnline();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problems, setProblems] = useState<Problems>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success'; text: string } | null>(null);

  const save = async () => {
    const found: Problems = {};
    if (!current) found.current = 'Enter your current password.';
    if (next.length < MIN_LENGTH) found.next = `Use at least ${MIN_LENGTH} characters.`;
    else if (new TextEncoder().encode(next).length > MAX_BYTES) found.next = 'That password is too long.';
    else if (next === current) found.next = 'Choose a password different from the current one.';
    if (confirm !== next) found.confirm = 'The two new passwords don’t match.';
    setProblems(found);
    if (Object.keys(found).length > 0) return setMsg({ tone: 'danger', text: 'Fix the fields marked in red.' });

    setBusy(true);
    setMsg(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg({ tone: 'success', text: 'Password changed. Your other devices are signed out.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell
      title="Change password"
      subtitle="Choose a new password for signing in"
      footer={
        <View style={styles.block}>
          <PrimaryButton label="Change password" loading={busy} disabled={!online} onPress={save} />
          <PrimaryButton label="Back" variant="text" disabled={busy} onPress={() => router.back()} />
        </View>
      }>
      {!online ? <Notice tone="info">Connect to the internet to change your password.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <CardSection icon={sym('lock', 'lock')} accent="blue" title="Password">
        <TextField
          label="Current password"
          value={current}
          onChangeText={(v) => (setCurrent(v), setProblems((p) => ({ ...p, current: undefined })))}
          error={problems.current}
          secure
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextField
          label="New password"
          value={next}
          onChangeText={(v) => (setNext(v), setProblems((p) => ({ ...p, next: undefined })))}
          error={problems.next}
          secure
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextField
          label="Confirm new password"
          value={confirm}
          onChangeText={(v) => (setConfirm(v), setProblems((p) => ({ ...p, confirm: undefined })))}
          error={problems.confirm}
          secure
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <ThemedText type="small" themeColor="textSecondary">
          At least {MIN_LENGTH} characters. If you have forgotten your password, ask Admin to reset it.
        </ThemedText>
      </CardSection>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
});
