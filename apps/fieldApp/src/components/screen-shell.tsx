import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing, WideContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

type Props = {
  title: string;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** A line under the title. */
  subtitle?: string;
  /** Use the wider tablet width (two-column screens) instead of the form width. */
  wide?: boolean;
  /** A bar pinned under the scroll area (the screen's main actions). */
  footer?: ReactNode;
};

/**
 * The frame every pushed screen shares: back button, title, centred and width-capped scroll area.
 * Pass `onRefresh` to let the list be pulled down to reload, and `footer` to pin the main actions at the bottom.
 */
export function ScreenShell({ title, children, onRefresh, refreshing = false, subtitle, wide, footer }: Props) {
  const theme = useTheme();
  const maxWidth = wide ? WideContentWidth : MaxContentWidth;
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <ScrollView
            contentContainerStyle={[styles.content, { maxWidth }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                  {title}
                </ThemedText>
                {subtitle ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {subtitle}
                  </ThemedText>
                ) : null}
              </View>
              <PrimaryButton label="Back" variant="text" onPress={() => router.back()} />
            </View>
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
              <View style={[styles.footerInner, { maxWidth }]}>{footer}</View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: '100%',
    alignSelf: 'center',
    padding: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { fontSize: 28, lineHeight: 34 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  footerInner: { width: '100%', alignSelf: 'center' },
});
