import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UserAvatar } from '@/components/user-avatar';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';
import { logout } from '@/lib/auth';
import { disablePush, enablePush, getPushStatus, isPushOff } from '@/lib/push';
import { countUnsent, isOnline } from '@/offline';

/** Who is signed in, which phone this is, and Logout. Opened from the Home header. */
export default function ProfileScreen() {
  const user = useCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);
  // Whether the person switched push off in the app (null until read).
  const [pushOff, setPushOff] = useState<boolean | null>(null);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  useEffect(() => {
    void isPushOff().then(setPushOff);
  }, []);

  async function togglePush() {
    setPushMsg(null);
    if (pushOff) {
      const ok = await enablePush();
      setPushOff(false);
      if (!ok) setPushMsg('Notifications could not be switched on here. Allow them for this app in the phone’s settings, and use the installed app (not Expo Go).');
    } else {
      await disablePush();
      setPushOff(true);
    }
  }

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
    // The root layout sends us to Login as soon as the session clears. Don't navigate here too,
    // or Login mounts a second time.
    await logout();
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Profile</ThemedText>

          <ThemedView type="backgroundElement" style={styles.photo}>
            <UserAvatar name={user.name} photoUrl={user.photoUrl} size={96} tone="plain" />
            <ThemedText type="smallBold">{user.name}</ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="Name" value={user.name} />
            <Row label="Employee code" value={user.employeeCode} />
            <Row label="Role" value={user.designation} />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <Row label="This device" value={Device.deviceName ?? 'Unknown'} />
            <Row label="Model" value={[Device.brand, Device.modelName].filter(Boolean).join(' ')} />
          </ThemedView>

          {Platform.OS === 'android' ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <Row label="Notifications" value={pushOff === null ? '…' : pushOff ? 'Off' : 'On'} />
              <ThemedText type="small" themeColor="textSecondary">
                {pushOff
                  ? 'You will not get reminders or messages as notifications. They still appear in your Inbox.'
                  : 'Reminders and messages from your office arrive as notifications, and always in your Inbox.'}
              </ThemedText>
              {pushMsg ? <ThemedText type="small" themeColor="warning">{pushMsg}</ThemedText> : null}
              <ThemedText type="small" themeColor="textSecondary">Push status: {getPushStatus()}</ThemedText>
              <PrimaryButton label={pushOff ? 'Turn notifications on' : 'Turn notifications off'} variant="text" disabled={pushOff === null} onPress={togglePush} />
            </ThemedView>
          ) : null}

          <PrimaryButton label="Change password" variant="text" onPress={() => router.push('/change-password')} />
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
  photo: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two, alignItems: 'center' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
});
