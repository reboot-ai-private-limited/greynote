import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Gradients, Spacing } from '@/constants/theme';
import { useCurrentUser } from '@/hooks/use-current-user';

import { SyncChip } from './sync-chip';
import { ThemedText } from './themed-text';

const BELL: SymbolViewProps['name'] = { ios: 'bell', android: 'notifications', web: 'notifications' } as SymbolViewProps['name'];
const PERSON: SymbolViewProps['name'] = { ios: 'person', android: 'person', web: 'person' } as SymbolViewProps['name'];

/** Home's blue header card: who you are, shortcuts to Inbox and Profile, and the sync status. */
export function HomeHeader() {
  const user = useCurrentUser();
  const name = user.name || 'there';

  return (
    <LinearGradient colors={Gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <ThemedText type="smallBold" style={styles.avatarLetter}>
            {name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>
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
          <SymbolView name={PERSON} size={16} tintColor="#2563EB" />
          <ThemedText type="smallBold" style={styles.profileLabel}>
            Profile
          </ThemedText>
        </Pressable>
      </View>
      <SyncChip />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  avatarLetter: { color: '#FFFFFF', fontSize: 20, lineHeight: 26 },
  who: { flex: 1 },
  greeting: { color: '#FFFFFF', fontSize: 20, lineHeight: 26 },
  role: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 16 },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  profileLabel: { color: '#1E3A8A' },
  pressed: { opacity: 0.8 },
});
