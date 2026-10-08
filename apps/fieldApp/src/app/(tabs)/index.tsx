import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FeatureTile } from '@/components/feature-tile';
import { PrimaryButton } from '@/components/primary-button';
import { SegmentedTabs } from '@/components/segmented-tabs';
import { SyncChip } from '@/components/sync-chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TodayCard } from '@/components/today-card';
import { BottomTabInset, Spacing, WideContentWidth } from '@/constants/theme';
import { FEATURES, SECTIONS, type Feature, type Section } from '@/features/catalog';
import { lockReason, useDayGate } from '@/hooks/use-day-gate';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useResponsive } from '@/hooks/use-responsive';

const SECTION_TABS: { value: Section; label: string }[] = SECTIONS.map((value) => ({ value, label: value }));
const LAST = SECTIONS.length - 1;

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Home (PRD §6.2): who you are, today's Tour Plan, and the four categories as tabs, each showing
 * its tiles. A tile that today's plan or a compliance block locks stays visible and says why when
 * tapped (HLD 10) — the server re-checks everything at Submit, so this is a UX gate only.
 *
 * The four categories are laid out side by side as one strip (a pager). Swiping drags the strip
 * with your finger; letting go (or tapping a tab) springs it to the nearest category. Nothing is
 * swapped mid-animation, so there is no wait for the next tiles — they are already beside the
 * current ones. The tab underline is driven by the same position, so it moves with the strip.
 */
export default function HomeScreen() {
  const user = useCurrentUser();
  const gate = useDayGate();
  const { columns } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();

  /** The pager position in pages: 0 = DCR … 3 = Utility. Fractions while dragging or settling. */
  const pos = useRef(new Animated.Value(0)).current;
  const [pageWidth, setPageWidth] = useState(Math.min(windowWidth, WideContentWidth));
  const [heights, setHeights] = useState<number[]>([]);
  /** While moving, hold the taller of the two pages' heights so nothing is clipped mid-slide. */
  const [holdHeight, setHoldHeight] = useState<number | null>(null);
  /** Which tab's label is highlighted: the nearest page to the pager's position. */
  const [shown, setShown] = useState(0);
  const live = useRef({ index: 0, pageWidth, heights: [] as number[] });
  live.current.pageWidth = pageWidth;
  live.current.heights = heights;

  useEffect(() => {
    const id = pos.addListener(({ value }) => {
      const nearest = Math.max(0, Math.min(LAST, Math.round(value)));
      setShown((current) => (current === nearest ? current : nearest));
    });
    return () => pos.removeListener(id);
  }, [pos]);

  function open(feature: Feature) {
    if (feature.route) router.push(feature.route);
    else router.push({ pathname: '/feature/[key]', params: { key: feature.key } });
  }

  /** Spring the strip to a page. `velocity` (pages per second) carries a flick's speed into it. */
  function goTo(target: number, velocity = 0) {
    const s = live.current;
    const to = Math.max(0, Math.min(LAST, target));
    const from = s.index;
    s.index = to;
    setHoldHeight(Math.max(s.heights[from] ?? 0, s.heights[to] ?? 0));
    Animated.spring(pos, {
      toValue: to,
      velocity,
      stiffness: 220,
      damping: 28, // just under critical: quick, no bounce
      mass: 1,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setHoldHeight(null);
    });
  }

  const swipe = useMemo(
    () =>
      PanResponder.create({
        // Only a clearly horizontal drag claims the gesture, so scrolling up and down still works.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        // Catch the strip mid-spring if the finger lands on it again.
        onPanResponderGrant: () => pos.stopAnimation(),
        onPanResponderMove: (_, g) => {
          const s = live.current;
          let p = s.index - g.dx / s.pageWidth;
          // Past the first or last page the strip resists (a third of the movement).
          if (p < 0) p *= 0.33;
          if (p > LAST) p = LAST + (p - LAST) * 0.33;
          pos.setValue(p);
        },
        onPanResponderRelease: (_, g) => {
          const s = live.current;
          const moved = -g.dx / s.pageWidth; // in pages
          const flick = -g.vx; // px/ms; negative dx = forward
          let target = s.index;
          if (moved > 0.18 || flick > 0.35) target = s.index + 1;
          else if (moved < -0.18 || flick < -0.35) target = s.index - 1;
          goTo(target, (-g.vx * 1000) / s.pageWidth);
        },
        onPanResponderTerminate: () => goTo(live.current.index),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads everything through `live`
    [],
  );

  const stripHeight = holdHeight ?? heights[live.current.index] ?? 420;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        {/* The tabs are child 3: sticky, so they stay in view while the tiles scroll. */}
        {/* removeClippedSubviews off: Android would otherwise drop the off-screen pages from drawing,
            and they would pop in late instead of sliding in beside the current one. */}
        <ScrollView contentContainerStyle={styles.content} stickyHeaderIndices={[3]} removeClippedSubviews={false}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={styles.greeting} numberOfLines={1}>
                Hello, {user.name || 'there'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user.employeeCode} · {user.designation}
              </ThemedText>
            </View>
            <PrimaryButton label="Profile" variant="text" onPress={() => router.push('/profile')} />
          </View>

          <SyncChip />
          <TodayCard />

          <SegmentedTabs
            tabs={SECTION_TABS}
            value={SECTIONS[shown] ?? 'DCR'}
            onChange={(s) => goTo(SECTIONS.indexOf(s))}
            position={pos}
          />

          <View
            style={{ height: stripHeight, overflow: 'hidden' }}
            removeClippedSubviews={false}
            onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
            {...swipe.panHandlers}>
            <Animated.View
              removeClippedSubviews={false}
              style={[
                styles.strip,
                { width: pageWidth * SECTIONS.length, transform: [{ translateX: Animated.multiply(pos, -pageWidth) }] },
              ]}>
              {SECTIONS.map((section, i) => (
                <Animated.View
                  key={section}
                  style={[
                    styles.page,
                    {
                      width: pageWidth,
                      // Fade with distance from the centre: fully visible when this page is in view,
                      // fading out as it slides away and fading in as it arrives.
                      opacity: pos.interpolate({
                        inputRange: [i - 1, i - 0.5, i, i + 0.5, i + 1],
                        outputRange: [0, 0.15, 1, 0.15, 0],
                        extrapolate: 'clamp',
                      }),
                    },
                  ]}
                  onLayout={(e) => {
                    const h = e.nativeEvent.layout.height;
                    setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })));
                  }}>
                  {chunk(
                    FEATURES.filter((f) => f.section === section),
                    columns,
                  ).map((row) => (
                    <View key={row[0]!.key} style={styles.row}>
                      {row.map((feature) => (
                        <FeatureTile
                          key={feature.key}
                          feature={feature}
                          lockedReason={lockReason(feature, gate)}
                          onOpen={() => open(feature)}
                          onLockedPress={(reason) => Alert.alert(`${feature.title} is locked`, reason)}
                        />
                      ))}
                      {/* Keep the last row's tiles the same width as the others. */}
                      {Array.from({ length: columns - row.length }, (_, k) => (
                        <View key={`pad-${k}`} style={styles.flex} />
                      ))}
                    </View>
                  ))}
                </Animated.View>
              ))}
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: WideContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  greeting: { fontSize: 20, lineHeight: 26 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // The four pages side by side; each takes its own natural height.
  strip: { flexDirection: 'row', alignItems: 'flex-start' },
  page: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
});
