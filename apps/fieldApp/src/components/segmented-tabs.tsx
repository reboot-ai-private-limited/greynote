import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Props<T extends string> = {
  tabs: { value: T; label: string }[];
  /** The tab whose label is highlighted. */
  value: T;
  onChange: (value: T) => void;
  /**
   * The pager's position in tab units (0 = first tab, 1.5 = halfway to the third). The underline is
   * driven by it, so it moves exactly with a swipe instead of jumping when the page changes.
   */
  position: Animated.Value;
};

/** A row of equal-width tabs with an underline that tracks a pager's position. */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, position }: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const tabWidth = width / tabs.length;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.row, { borderBottomColor: theme.border, backgroundColor: theme.background }]}>
      {tabs.map((t) => {
        const selected = t.value === value;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(t.value)}
            style={styles.tab}>
            <ThemedText type="smallBold" themeColor={selected ? 'primary' : 'textSecondary'} numberOfLines={1}>
              {t.label}
            </ThemedText>
          </Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: tabWidth,
              backgroundColor: theme.primary,
              transform: [{ translateX: Animated.multiply(position, tabWidth) }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: Spacing.three },
  indicator: { position: 'absolute', left: 0, bottom: 0, height: 3, borderRadius: 2 },
});
