import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { login } from '@/lib/auth';

/** Mirrors apps/api's passwordSchema (identity/interface/password.schema.ts). */
const PASSWORD_MIN_LENGTH = 8;

/**
 * Login — employee code + password only (client sign-off A1: no OTP). Password reset is
 * Admin-only (A5), so there's deliberately no "Forgot password?" self-service link.
 *
 * The employee code is sent exactly as typed (trimmed): the backend matches it case-sensitively
 * and doesn't normalize it, so forcing capitals here would break a code created in lowercase.
 *
 * Calls POST /api/identity/auth/login (src/lib/auth.ts). Device fields come from expo-application
 * and expo-device, never user input. A 409/403 device refusal routes to /device-status with the
 * server's `reason` — see hld/04 §2 and LLD/identity.md.
 */
export default function LoginScreen() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string>();

  const code = employeeCode.trim();
  const employeeCodeError = submitted && !code ? 'Enter your Employee Code' : undefined;
  const passwordError = !submitted
    ? undefined
    : !password
      ? 'Enter your Password'
      : password.length < PASSWORD_MIN_LENGTH
        ? `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
        : undefined;

  async function handleLogin() {
    setSubmitted(true);
    setFormError(undefined);
    if (!code || password.length < PASSWORD_MIN_LENGTH) return;

    setLoading(true);
    const result = await login(code, password);
    setLoading(false);

    if (result.ok) {
      router.replace('/(tabs)');
    } else if (result.kind === 'device') {
      router.push({
        pathname: '/device-status',
        params: {
          reason: result.reason,
          ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}),
          ...(result.limit ? { limit: String(result.limit) } : {}),
        },
      });
    } else {
      setFormError(result.message);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          // 'padding' on both platforms: Android is edge-to-edge, so the OS no longer resizes the window.
          behavior="padding"
          style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets>
            <ThemedView style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                My Greynote
              </ThemedText>
              <ThemedText themeColor="textSecondary">Sign in to continue</ThemedText>
            </ThemedView>

            <ThemedView style={styles.form}>
              <TextField
                label="Employee Code"
                value={employeeCode}
                onChangeText={setEmployeeCode}
                autoCapitalize="none"
                autoComplete="username"
                returnKeyType="next"
                error={employeeCodeError}
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                error={passwordError}
              />

              {formError ? (
                <ThemedText type="small" themeColor="danger" style={styles.footnote}>
                  {formError}
                </ThemedText>
              ) : null}

              <PrimaryButton label="Login" loading={loading} onPress={handleLogin} />

              <ThemedText type="small" themeColor="textSecondary" style={styles.footnote}>
                Forgot your password? Contact your Admin — passwords can only be reset from the
                web portal.
              </ThemedText>
            </ThemedView>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  header: {
    gap: Spacing.one,
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  form: {
    gap: Spacing.three,
  },
  footnote: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
});
