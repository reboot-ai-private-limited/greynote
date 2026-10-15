import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import type { Visual } from '@/lib/marketing';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ZoomableImage } from './zoomable-image';

type Props = {
  items: Visual[];
  /** Which one to open on. */
  startIndex: number;
  onClose: () => void;
  /** A video or PDF cannot be shown here: this opens it in the phone's own viewer. */
  onOpenFile: (visual: Visual) => void;
};

const isImage = (v: Visual) => v.mimeType.startsWith('image/');
const fileLabel = (v: Visual) => (v.mimeType.startsWith('video/') ? 'VIDEO' : v.mimeType === 'application/pdf' ? 'PDF' : 'FILE');

/**
 * A full-screen look at visuals, one at a time: the picture takes the whole screen (shown whole, never cropped), with nothing
 * around it but a small Close button and the dots, both drawn over the image. Swipe sideways for the next and previous; the
 * phone's back also leaves. A video or PDF shows a card with a button that opens it in the phone's viewer.
 */
export function VisualViewer({ items, startIndex, onClose, onOpenFile }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const [zoomed, setZoomed] = useState(false);
  const last = items.length - 1;

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* A Modal is a separate native window on Android: gestures inside it need their own root view. */}
      <GestureHandlerRootView style={styles.root}>
        <FlatList
          // A new size (rotation) lays the pages out again, on the picture being looked at.
          key={`${Math.round(width)}x${Math.round(height)}`}
          data={items}
          keyExtractor={(v) => v.id}
          horizontal
          pagingEnabled
          // A zoomed picture is dragged around with the finger; the list waits until it is back to normal size.
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.min(index, last)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onEnd}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              {isImage(item) ? (
                <ZoomableImage uri={item.fileUrl} width={width} height={height} label={item.title} onZoomChange={setZoomed} />
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

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          onPress={onClose}
          style={[styles.close, { top: insets.top + Spacing.two, right: Math.max(insets.right, Spacing.three) }]}>
          <ThemedText type="smallBold" style={styles.light}>
            Close
          </ThemedText>
        </Pressable>

        {last > 0 ? (
          <View style={[styles.dots, { bottom: insets.bottom + Spacing.three }]} pointerEvents="none">
            {items.map((v, i) => (
              <View key={v.id} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  light: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.7)' },
  fileCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  close: { position: 'absolute', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' },
  dots: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { backgroundColor: '#fff' },
});
