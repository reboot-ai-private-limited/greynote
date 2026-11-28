import { router } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing, WideContentWidth } from '@/constants/theme';
import { EndReachedContext } from '@/hooks/use-end-reached';
import { ScrollAreaContext } from '@/hooks/use-form-errors';
import { useTheme } from '@/hooks/use-theme';
import { useSyncNow } from '@/offline/hooks';

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
 * Every screen can be synced by hand (2026-11-28): the ↻ beside Back, or pulling the screen down, sends what is unsent and pulls fresh
 * data. A screen's own `onRefresh` (a list it loads itself) runs alongside. `footer` pins the main actions at the bottom.
 */
export function ScreenShell({ title, children, onRefresh, refreshing = false, subtitle, wide, footer }: Props) {
  const theme = useTheme();
  const maxWidth = wide ? WideContentWidth : MaxContentWidth;
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const frameRef = useRef<View>(null);
  // Infinite scroll: a list inside registers its "load more" here (useOnEndReached); it is called near the bottom, or when the content is too short to scroll.
  const endRef = useRef<(() => void) | null>(null);
  const viewport = useRef(0);
  const NEAR = 300;
  const [area] = useState(() => ({ ref: scrollRef, frame: frameRef, offset }));
  const sync = useSyncNow();
  const refreshAll = () => {
    onRefresh?.();
    void sync.run();
  };
  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <View ref={frameRef} collapsable={false} style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            onScroll={(e) => {
              const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
              offset.current = contentOffset.y;
              if (contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR) endRef.current?.();
            }}
            onLayout={(e) => {
              viewport.current = e.nativeEvent.layout.height;
            }}
            onContentSizeChange={(_w, h) => {
              if (h <= viewport.current + NEAR) endRef.current?.();
            }}
            scrollEventThrottle={32}
            contentContainerStyle={[styles.content, { maxWidth }]}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing || sync.busy} onRefresh={refreshAll} />}>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sync now"
                accessibilityState={{ busy: sync.busy, disabled: sync.busy }}
                disabled={sync.busy}
                hitSlop={8}
                onPress={refreshAll}
                style={({ pressed }) => [styles.sync, { borderColor: theme.border }, pressed && styles.pressed]}>
                {sync.busy ? <ActivityIndicator size="small" color={theme.primary} /> : <ThemedText type="smallBold" themeColor="primary" style={styles.syncIcon}>↻</ThemedText>}
              </Pressable>
              <PrimaryButton label="Back" variant="text" onPress={() => router.back()} />
            </View>
            {sync.message ? (
              <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
                {sync.message}
              </ThemedText>
            ) : null}
            <EndReachedContext.Provider value={endRef}>
              <ScrollAreaContext.Provider value={area}>{children}</ScrollAreaContext.Provider>
            </EndReachedContext.Provider>
          </ScrollView>
          </View>
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
  sync: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  syncIcon: { fontSize: 20, lineHeight: 22 },
  pressed: { opacity: 0.6 },
  title: { fontSize: 28, lineHeight: 34 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  footerInner: { width: '100%', alignSelf: 'center' },
});
