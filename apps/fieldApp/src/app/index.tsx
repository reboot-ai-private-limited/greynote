import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';
import { loadCurrentUser } from '@/lib/auth';
import { restoreSession } from '@/lib/session';
import { useTheme } from '@/hooks/use-theme';

/**
 * In-app Splash screen (distinct from the native app.json splash — see src/app/_layout.tsx).
 *
 * Restores the saved session from secure storage, then confirms it with GET /identity/auth/me
 * (which refreshes the token if it expired, see src/lib/api.ts): valid → /(tabs); rejected →
 * /login. If the server can't be reached the saved user is trusted and the app opens anyway —
 * the field app has to work offline (HLD 01).
 *
 * TODO: also kick off the first delta-sync of reference data here (HLD 01 §1.1) once Stage 1 lands.
 */
export default function SplashScreen() {
  const theme = useTheme();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [hasSession] = await Promise.all([
        restoreSession(),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
      let target: '/login' | '/(tabs)' = '/login';
      if (hasSession) {
        try {
          await loadCurrentUser();
          target = '/(tabs)';
        } catch (err) {
          // A 401 here means refresh failed too (session already cleared) → Login.
          // Anything else (offline, server error) → keep the saved session and open the app.
          target = err instanceof ApiError && err.status === 401 ? '/login' : '/(tabs)';
        }
      }
      if (!cancelled) router.replace(target);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BrandLogo width={240} />
        <ThemedText type="subtitle" style={styles.appName}>
          My Greynote
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Field Force Sales Automation
        </ThemedText>
        <ActivityIndicator style={styles.spinner} color={theme.primary} />
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  appName: {
    textAlign: 'center',
  },
  spinner: {
    marginTop: Spacing.five,
  },
});
