import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { logout } from '@/lib/auth';
import { countUnsent, isOnline } from '@/offline';

/** Who is signed in, which phone this is, and Logout. Opened from the Home header. */
export default function ProfileScreen() {
  const user = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);

  async function confirmLogout() {
    const unsent = await countUnsent();
    if (unsent === 0) return handleLogout();
    if (!isOnline()) {
      Alert.alert(
        'Connect to log out',
        `You have ${unsent} unsent record${unsent === 1 ? '' : 's'}. Connect to the internet so they can be backed up first — logging out now would lose them.`,
      );
      return;
    }
    Alert.alert(
      'Log out?',
      `${unsent} unsent record${unsent === 1 ? '' : 's'} will be backed up and restored when you log in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: handleLogout },
      ],
    );
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    // The (tabs) layout redirects once the session clears; this covers leaving Profile itself.
    router.replace('/login');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Profile</ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="Name" value={user.name} />
            <Row label="Employee code" value={user.employeeCode} />
            <Row label="Role" value={user.designation} />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="This device" value={Device.deviceName ?? 'Unknown'} />
            <Row label="Model" value={[Device.brand, Device.modelName].filter(Boolean).join(' ')} />
          </ThemedView>

          <PrimaryButton label="Back" variant="text" onPress={() => router.back()} />
          <PrimaryButton label="Log out" loading={loggingOut} onPress={confirmLogout} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value || '—'}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
});
