import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Gradients, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';

import { SyncChip } from './sync-chip';
import { ThemedText } from './themed-text';
import { UserAvatar } from './user-avatar';

const BELL: SymbolViewProps['name'] = { ios: 'bell', android: 'notifications', web: 'notifications' } as SymbolViewProps['name'];
const PERSON: SymbolViewProps['name'] = { ios: 'person', android: 'person', web: 'person' } as SymbolViewProps['name'];

/** Home's blue header card: who you are, shortcuts to Inbox and Profile, and the sync status. */
export function HomeHeader() {
  const user = useCurrentUser();
  const name = user.name || 'there';

  return (
    <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.row}>
        <UserAvatar name={name} photoUrl={user.photoUrl} size={44} />
        <View style={styles.who}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.greeting}>
            Hello, {name}
          </ThemedText>
          <ThemedText type="small" numberOfLines={1} style={styles.role}>
            {user.employeeCode} · {user.designation}
          </ThemedText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inbox"
          onPress={() => router.push('/inbox')}
          style={({ pressed }) => [styles.bell, pressed && styles.pressed]}>
          <SymbolView name={BELL} size={20} tintColor="#FFFFFF" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => router.push('/profile')}
          style={({ pressed }) => [styles.profile, pressed && styles.pressed]}>
          <SymbolView name={PERSON} size={20} tintColor="#2563EB" />
        </Pressable>
      </View>
      <SyncChip />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  who: { flex: 1 },
  greeting: { color: '#FFFFFF', fontSize: 16, lineHeight: 22 },
  role: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  profile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.8 },
});
