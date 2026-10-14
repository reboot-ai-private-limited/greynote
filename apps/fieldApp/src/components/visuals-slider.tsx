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
const ASPECT = 16 / 7;

/**
 * Home's visuals slider: the active pictures Admin uploaded, one at a time, sliding on its own and by swipe.
 * Tapping a picture opens Visuals. Videos and PDFs are left out (they open outside the app); with no picture
 * (or nothing cached yet) the slider is not drawn at all.
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

  useEffect(() => {
    if (count < 2 || width === 0) return;
    const id = setInterval(() => {
      if (touching.current) return;
      setIndex((i) => {
        const next = (i + 1) % count;
        listRef.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, SLIDE_MS);
    return () => clearInterval(id);
  }, [count, width]);

  // Not null: Home's sticky tab bar is found by child position, and a missing child would shift it. The negative
  // margin cancels the gap Home puts between its children.
  if (count === 0) return <View style={styles.none} />;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    touching.current = false;
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 ? (
        <FlatList
          ref={listRef}
          data={slides}
          keyExtractor={(v) => v.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
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
              style={{ width, height: width / ASPECT }}>
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
      {count > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {slides.map((v, i) => (
            <View key={v.id} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden' },
  none: { height: 0, marginTop: -Spacing.three },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, backgroundColor: 'rgba(0,0,0,0.4)' },
  captionText: { color: '#fff' },
  dots: { position: 'absolute', top: Spacing.two, right: Spacing.two, flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { backgroundColor: '#fff' },
});
