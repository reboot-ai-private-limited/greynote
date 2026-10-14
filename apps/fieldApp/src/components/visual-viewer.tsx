import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import type { Visual } from '@/lib/marketing';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';

type Props = {
  items: Visual[];
  /** Which one to open on. */
  startIndex: number;
  onClose: () => void;
  /** A video or PDF cannot be shown here: this opens it in the phone's own viewer. */
  onOpenFile: (visual: Visual) => void;
  /** The line under the title (category, product…). */
  caption: (visual: Visual) => string;
};

const isImage = (v: Visual) => v.mimeType.startsWith('image/');
const fileLabel = (v: Visual) => (v.mimeType.startsWith('video/') ? 'VIDEO' : v.mimeType === 'application/pdf' ? 'PDF' : 'FILE');

/**
 * A full-screen look at visuals, one at a time: swipe sideways (or use the arrows) for the next and previous, tap Close
 * (or the phone's back) to leave. Pictures are shown whole; a video or PDF shows a card with a button that opens it in the
 * phone's viewer.
 */
export function VisualViewer({ items, startIndex, onClose, onOpenFile, caption }: Props) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Visual>>(null);
  const [index, setIndex] = useState(startIndex);
  const last = items.length - 1;
  const current = items[index] ?? items[0]!;

  const goTo = (to: number) => {
    const next = Math.max(0, Math.min(last, to));
    listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    setIndex(next);
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <SafeAreaView style={styles.root}>
          <View style={styles.top}>
            <View style={styles.titleBox}>
              <ThemedText type="smallBold" numberOfLines={2} style={styles.light}>
                {current.title}
              </ThemedText>
              <ThemedText type="small" numberOfLines={1} style={styles.dim}>
                {`${last > 0 ? `${index + 1} of ${last + 1} · ` : ''}${caption(current)}`}
              </ThemedText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={onClose} style={styles.close}>
              <ThemedText type="smallBold" style={styles.light}>
                Close
              </ThemedText>
            </Pressable>
          </View>

          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(v) => v.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={startIndex}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={onEnd}
            renderItem={({ item }) => (
              <View style={[styles.slide, { width }]}>
                {isImage(item) ? (
                  <Image source={{ uri: item.fileUrl }} style={styles.image} contentFit="contain" accessibilityLabel={item.title} />
                ) : (
                  <View style={styles.fileCard}>
                    <ThemedText type="subtitle" style={styles.light}>
                      {fileLabel(item)}
                    </ThemedText>
                    <ThemedText type="small" style={styles.dim}>
                      Opens in your phone’s viewer.
                    </ThemedText>
                    <PrimaryButton label="Open file" onPress={() => onOpenFile(item)} />
                  </View>
                )}
              </View>
            )}
          />

          {last > 0 ? (
            <View style={styles.bottom}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous" disabled={index === 0} onPress={() => goTo(index - 1)} style={[styles.arrow, index === 0 && styles.off]}>
                <ThemedText type="subtitle" style={styles.light}>
                  ‹
                </ThemedText>
              </Pressable>
              <View style={styles.dots}>
                {items.map((v, i) => (
                  <View key={v.id} style={[styles.dot, i === index && styles.dotOn]} />
                ))}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Next" disabled={index === last} onPress={() => goTo(index + 1)} style={[styles.arrow, index === last && styles.off]}>
                <ThemedText type="subtitle" style={styles.light}>
                  ›
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  titleBox: { flex: 1 },
  light: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.7)' },
  close: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  fileCard: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  arrow: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  off: { opacity: 0.3 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotOn: { backgroundColor: '#fff' },
});
