import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/**
 * The frame every pushed screen shares: back button, title, centred and width-capped scroll area.
 * Pass `onRefresh` to let the list be pulled down to reload.
 */
export function ScreenShell({ title, children, onRefresh, refreshing = false }: { title: string; children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                {title}
              </ThemedText>
              <PrimaryButton label="Back" variant="text" onPress={() => router.back()} />
            </View>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flex: 1, fontSize: 28, lineHeight: 34 },
});
