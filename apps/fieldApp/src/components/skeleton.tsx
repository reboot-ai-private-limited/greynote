import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A softly pulsing grey bar: where a line of text will appear. */
export function SkeletonBar({ width = '100%', height = 14 }: { width?: DimensionValue; height?: number }) {
  const theme = useTheme();
  return <View style={{ width, height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected }} />;
}

/** One card-shaped placeholder: a title bar and a few shorter lines, like a list row. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <SkeletonBar width="40%" height={16} />
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonBar key={i} width={i === lines - 1 ? '55%' : '85%'} />
      ))}
    </View>
  );
}

/**
 * Stand-in for a list or a detail screen while it loads: a few card shapes that pulse together, so the page
 * keeps its layout instead of showing a line of "Loading…" in the corner. Reads as "busy" to a screen reader.
 */
function usePulse() {
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

export function Skeleton({ cards = 3, lines = 3 }: { cards?: number; lines?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={[styles.list, { opacity: pulse }]}>
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </Animated.View>
  );
}

/** A few pulsing lines for inside a card that is still loading (a detail frame). */
export function SkeletonLines() {
  const pulse = usePulse();
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={[styles.lines, { opacity: pulse }]}>
      <SkeletonBar width="90%" />
      <SkeletonBar width="75%" />
      <SkeletonBar width="85%" />
      <SkeletonBar width="60%" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  lines: { gap: Spacing.two },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
});
