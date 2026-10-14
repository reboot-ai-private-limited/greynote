import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listVisuals } from '@/lib/marketing';
import { useCachedFetch } from '@/offline/cached-fetch';

import { ThemedText } from './themed-text';

const SLIDE_MS = 4000;
const GAP = Spacing.two + 4;
/** Width over height of one slide: a wide, low banner. */
const ASPECT = 2.3;
/** A slide never grows taller than this, however wide the screen. */
const MAX_HEIGHT = 170;

/** How many slides fit side by side: one on a phone, two on a tablet, three on a large tablet (by the width it is given). */
const perViewFor = (width: number) => (width >= 900 ? 3 : width >= 560 ? 2 : 1);

/**
 * Home's visuals slider: the active pictures Admin uploaded, as a low banner that slides on its own and by swipe. A phone shows
 * one picture at a time; a tablet shows two or three side by side and moves one picture at a time. Tapping a picture opens
 * Visuals. Videos and PDFs are left out (they open outside the app); with no picture (or nothing cached yet) the slider is not
 * drawn at all.
 */
export function VisualsSlider() {
  const theme = useTheme();
  const list = useCachedFetch('visuals', () => listVisuals());
  const slides = (list.data ?? []).filter((v) => v.status === 'active' && v.mimeType.startsWith('image/'));
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList>(null);
  const touching = useRef(false);
  const count = slides.length;

  // Never more slides across than there are pictures, so two pictures on a wide screen are not left with an empty third.
  const perView = Math.max(1, Math.min(perViewFor(width), count));
  const itemWidth = width > 0 ? (width - GAP * (perView - 1)) / perView : 0;
  const itemHeight = Math.min(itemWidth / ASPECT, MAX_HEIGHT);
  const step = itemWidth + GAP;
  /** The last position the strip can rest at: the final picture sits at the right edge. */
  const maxIndex = Math.max(0, count - perView);

  useEffect(() => {
    if (maxIndex < 1 || width === 0) return;
    const id = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = i >= maxIndex ? 0 : i + 1;
        listRef.current?.scrollToOffset({ offset: next * step, animated: true });
        return next;
      });
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [maxIndex, width, step]);

  // Not null: Home's sticky tab bar is found by child position, and a missing child would shift it. The negative
  // margin cancels the gap Home puts between its children.
  if (count === 0) return <View style={styles.none} />;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    touching.current = false;
    if (step > 0) setIndex(Math.max(0, Math.min(maxIndex, Math.round(e.nativeEvent.contentOffset.x / step))));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 ? (
        <FlatList
          // A new width (rotation) lays the strip out again from the start.
          key={`${perView}-${Math.round(width)}`}
          ref={listRef}
          data={slides}
          keyExtractor={(v) => v.id}
          horizontal
          snapToInterval={step}
          snapToAlignment="start"
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
          getItemLayout={(_, i) => ({ length: step, offset: step * i, index: i })}
          onScrollBeginDrag={() => {
            touching.current = true;
          }}
          onMomentumScrollEnd={onEnd}
          onScrollEndDrag={() => {
            touching.current = false;
          }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel={item.title}
              onPress={() => router.push('/visuals')}
              style={[styles.card, { width: itemWidth, height: itemHeight }]}>
              <Image source={{ uri: item.fileUrl }} contentFit="cover" style={[styles.image, { backgroundColor: theme.backgroundElement }]} />
              <View style={styles.caption}>
                <ThemedText type="smallBold" numberOfLines={1} style={styles.captionText}>
                  {item.title}
                </ThemedText>
              </View>
            </Pressable>
          )}
        />
      ) : null}
      {maxIndex > 0 ? (
        <View style={styles.dots} pointerEvents="none">
          {Array.from({ length: maxIndex + 1 }, (_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  card: { borderRadius: 16, overflow: 'hidden' },
  none: { height: 0, marginTop: -Spacing.three },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, backgroundColor: 'rgba(0,0,0,0.4)' },
  captionText: { color: '#fff' },
  dots: { position: 'absolute', top: Spacing.two, right: Spacing.two, flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: '#fff' },
});
