import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DeviceBlockReason } from '@/types/auth';

type Params = {
  reason?: string;
  /** ISO date — when a rejected phone may request approval again (DEVICE_REJECTED only). */
  retryAfter?: string;
  /** Max phones per field employee (DEVICE_LIMIT_REACHED only). */
  limit?: string;
};

type Content = {
  icon: SymbolViewProps['name'];
  color: ThemeColor;
  title: string;
  message: string;
  hint: string;
  action: string;
};

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function contentFor(reason: string | undefined, params: Params): Content {
  switch (reason as DeviceBlockReason | undefined) {
    case 'DEVICE_APPROVAL_PENDING':
      return {
        icon: { ios: 'clock', android: 'schedule', web: 'schedule' },
        color: 'primary',
        title: 'Waiting for Admin approval',
        message: 'This phone has been sent to your Admin for approval. Every new phone needs approval before you can log in on it.',
        hint: 'Once your Admin approves it, log in again.',
        action: 'Try again',
      };
    case 'DEVICE_REJECTED': {
      const until = formatDate(params.retryAfter);
      return {
        icon: { ios: 'xmark.circle', android: 'cancel', web: 'cancel' },
        color: 'danger',
        title: 'Device not approved',
        message: 'Your Admin rejected this phone, so you can’t log in on it.',
        hint: until
          ? `You can request approval again after ${until}. Contact your Admin if this is a mistake.`
          : 'Contact your Admin if this is a mistake.',
        action: 'Back to Login',
      };
    }
    case 'DEVICE_LIMIT_REACHED': {
      const limit = params.limit ?? '2';
      return {
        icon: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
        color: 'warning',
        title: 'Device limit reached',
        message: `You already have ${limit} phones registered, which is the maximum.`,
        hint: 'Ask your Admin to remove an old phone first, then log in again. Logging out on the old phone doesn’t free a slot.',
        action: 'Back to Login',
      };
    }
    default:
      return {
        icon: { ios: 'exclamationmark.circle', android: 'error', web: 'error' },
        color: 'danger',
        title: 'Can’t log in on this phone',
        message: 'This phone isn’t allowed to log in right now.',
        hint: 'Contact your Admin.',
        action: 'Back to Login',
      };
  }
}

/**
 * Shown instead of a generic error when login is refused because of the phone (hld/04 §2,
 * client sign-off A2–A3): waiting for approval, rejected, or at the 2-phone limit. Login routes
 * here with the server's `reason` code; this screen makes no API calls itself.
 */
export default function DeviceStatusScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<Params>();
  const content = contentFor(params.reason, params);
  const accent = theme[content.color];

  const deviceName = Device.deviceName ?? 'This phone';
  const deviceModel = [Device.brand, Device.modelName].filter(Boolean).join(' ');

  function goBackToLogin() {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedView style={styles.body}>
            <ThemedView style={[styles.iconCircle, { backgroundColor: theme.backgroundElement }]}>
              <SymbolView name={content.icon} size={40} tintColor={accent} />
            </ThemedView>

            <ThemedText type="subtitle" style={styles.title}>
              {content.title}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {content.message}
            </ThemedText>

            <ThemedView type="backgroundElement" style={styles.deviceCard}>
              <ThemedText type="small" themeColor="textSecondary">
                This device
              </ThemedText>
              <ThemedText type="smallBold">{deviceName}</ThemedText>
              {deviceModel ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {deviceModel}
                </ThemedText>
              ) : null}
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {content.hint}
            </ThemedText>
          </ThemedView>

          <PrimaryButton label={content.action} onPress={goBackToLogin} />
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    gap: Spacing.five,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  deviceCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: Spacing.half,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    marginVertical: Spacing.two,
  },
});
