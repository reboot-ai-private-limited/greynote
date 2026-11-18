import { router, useLocalSearchParams } from 'expo-router';
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
import { requestPasswordReset, resetPassword, type ResetCodeResult } from '@/lib/auth';
import { useOnline } from '@/offline';

const MIN_LENGTH = 8;
/** The server refuses a password over 72 bytes. */
const MAX_BYTES = 72;

const errorText = (err: unknown) =>
  err instanceof ApiError || err instanceof NetworkError ? err.message : 'Something went wrong. Please try again.';

/**
 * Forgot password (docs/mobile/account.md), for everyone: 1) the employee ID; a code is emailed to the address in your details (an account with no email is told to
 * contact an Admin, with who); 2) the 6-digit code and a new password. The server signs you out everywhere, so you log in again. Opened from Login, or from Change
 * password with the ID filled in. Needs a connection.
 */
export default function ForgotPasswordScreen() {
  const online = useOnline();
  const preset = useLocalSearchParams<{ code?: string }>().code;
  const [employeeCode, setEmployeeCode] = useState(typeof preset === 'string' ? preset : '');
  const [step, setStep] = useState<'ID' | 'CODE' | 'DONE'>('ID');
  const [noEmail, setNoEmail] = useState<Extract<ResetCodeResult, { delivery: 'NO_EMAIL' }> | null>(null);
  const [otp, setOtp] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'danger' | 'success' | 'info'; text: string } | null>(null);

  const sendCode = async () => {
    if (!employeeCode.trim()) return setMsg({ tone: 'danger', text: 'Enter your employee ID.' });
    setBusy(true);
    setMsg(null);
    setNoEmail(null);
    try {
      const res = await requestPasswordReset(employeeCode);
      if (res.delivery === 'NO_EMAIL') setNoEmail(res);
      else {
        setStep('CODE');
        setMsg({ tone: 'info', text: 'If that ID has an email saved, we sent a 6-digit code to it. It works for 10 minutes.' });
      }
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!/^\d{6}$/.test(otp.trim())) return setMsg({ tone: 'danger', text: 'The code is 6 digits.' });
    if (next.length < MIN_LENGTH) return setMsg({ tone: 'danger', text: `Use at least ${MIN_LENGTH} characters for the new password.` });
    if (new TextEncoder().encode(next).length > MAX_BYTES) return setMsg({ tone: 'danger', text: 'That password is too long.' });
    if (confirm !== next) return setMsg({ tone: 'danger', text: 'The two passwords don’t match.' });
    setBusy(true);
    setMsg(null);
    try {
      await resetPassword(employeeCode, otp, next);
      setStep('DONE');
    } catch (err) {
      setMsg({ tone: 'danger', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell title="Forgot password" subtitle={step === 'CODE' ? 'Enter the code we emailed you' : 'We’ll email you a code'}>
      {!online ? <Notice tone="info">Connect to the internet to reset your password.</Notice> : null}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}

      {step === 'DONE' ? (
        <>
          <Notice tone="success">Your password was changed. Sign in with the new password.</Notice>
          <PrimaryButton label="Go to Login" onPress={() => router.replace('/login')} />
        </>
      ) : (
        <CardSection icon={sym('lock', 'lock_reset')} accent="blue" title={step === 'ID' ? 'Your employee ID' : 'Code and new password'}>
          <TextField label="Employee ID" value={employeeCode} onChangeText={setEmployeeCode} autoCapitalize="none" autoCorrect={false} editable={!busy && step === 'ID'} />
          {noEmail ? (
            <Notice tone="warning" title="No email is saved for you">
              {`Contact your Admin to reset your password or to add your email.${noEmail.admin ? ` ${noEmail.admin.name}: ${noEmail.admin.email}` : ''}`}
            </Notice>
          ) : null}
          {step === 'ID' ? (
            <PrimaryButton label="Send me a code" loading={busy} disabled={!online} onPress={sendCode} />
          ) : (
            <>
              <TextField label="6-digit code" value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" editable={!busy} />
              <TextField label="New password" value={next} onChangeText={setNext} secure autoCapitalize="none" autoCorrect={false} editable={!busy} />
              <TextField label="Confirm new password" value={confirm} onChangeText={setConfirm} secure autoCapitalize="none" autoCorrect={false} editable={!busy} />
              <ThemedText type="small" themeColor="textSecondary">{`At least ${MIN_LENGTH} characters.`}</ThemedText>
              <PrimaryButton label="Change password" loading={busy} disabled={!online} onPress={save} />
              <View style={styles.row}>
                <PrimaryButton label="Send a new code" variant="text" disabled={busy || !online} onPress={sendCode} />
                <ThemedText type="small" themeColor="textSecondary">You can ask again after a minute.</ThemedText>
              </View>
            </>
          )}
          <PrimaryButton label="Back" variant="text" disabled={busy} onPress={() => router.back()} />
        </CardSection>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
});
