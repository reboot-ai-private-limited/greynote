import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

const TRACK_PADDING = 4;

type Props<T extends string> = {
  /** `color` is the dot beside the label. */
  tabs: { value: T; label: string; color: string }[];
  /** The tab whose label is highlighted. */
  value: T;
  onChange: (value: T) => void;
  /**
   * The pager's position in tab units (0 = first tab, 1.5 = halfway to the third). The white pill is
   * driven by it, so it moves exactly with a swipe instead of jumping when the page changes.
   */
  position: Animated.Value;
};

/** A row of equal-width tabs in a rounded track, with a pill that tracks a pager's position. */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, position }: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const tabWidth = (width - TRACK_PADDING * 2) / tabs.length;

  return (
    // Opaque backdrop: the tabs are sticky, so tiles scroll underneath them.
    <View style={[styles.backdrop, { backgroundColor: theme.background }]}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.track, { backgroundColor: '#EAF1FB', borderColor: '#DCE7F6' }]}>
        {width > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pill,
              {
                width: tabWidth,
                backgroundColor: theme.background,
                transform: [{ translateX: Animated.multiply(position, tabWidth) }],
              },
            ]}
          />
        ) : null}
        {tabs.map((t) => {
          const selected = t.value === value;
          return (
            <Pressable
              key={t.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onChange(t.value)}
              style={styles.tab}>
              <View style={[styles.dot, { backgroundColor: t.color }]} />
              <ThemedText type="smallBold" themeColor={selected ? 'text' : 'textSecondary'} numberOfLines={1}>
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { paddingVertical: Spacing.one },
  track: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: TRACK_PADDING,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pill: {
    position: 'absolute',
    left: TRACK_PADDING,
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    borderRadius: 10,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
