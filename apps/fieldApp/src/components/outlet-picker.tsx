import { useEffect, useState } from 'react';
import { Animated, Dimensions, FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export type OutletOption = { id: string; name: string; subtitle?: string };

type Props = {
  label: string;
  options: OutletOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Shown when `options` is empty — say why (no plan routes, nothing synced yet…). */
  emptyText: string;
};

/** A search box is only worth its space once the list is longer than this. */
const SEARCH_FROM = 6;

/**
 * The app's one dropdown (doctors, chemists, products, routes, people…). The closed field is a plain outlined
 * box — label above, the choice inside, a chevron at the end — and tapping it opens a bottom sheet with an
 * optional search and the options. The chosen option is marked with a tick and the primary colour, never a
 * filled background, so the form around it keeps its look.
 */
export function OutletPicker({ label, options, value, onChange, disabled, emptyText }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  // `mounted` outlives `open` by the length of the closing animation. The dark backdrop fades in place and only
  // the sheet slides — the Modal's own 'slide' would carry the backdrop up from the bottom with it.
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [slide] = useState(() => progress.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get('window').height, 0] }));
  const [query, setQuery] = useState('');
  const [keyboard, setKeyboard] = useState(0);
  const chosen = options.find((o) => o.id === value) ?? null;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((o) => `${o.name} ${o.subtitle ?? ''}`.toLowerCase().includes(needle)) : options;

  // A Modal does not resize for the keyboard, so lift the sheet by hand.
  useEffect(() => {
    if (!open) return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
      setKeyboard(0);
    };
  }, [open]);

  const show = () => {
    setMounted(true);
    setOpen(true);
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  };

  const close = () => {
    Keyboard.dismiss();
    setOpen(false);
    setQuery('');
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  };

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable
        accessibilityRole="combobox"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={show}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: theme.background, borderColor: open ? theme.primary : theme.border },
          pressed && { backgroundColor: theme.backgroundElement },
          disabled && styles.disabled,
        ]}>
        <View style={styles.flex}>
          {chosen ? (
            <>
              <ThemedText type="default" numberOfLines={1}>
                {chosen.name}
              </ThemedText>
              {chosen.subtitle ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {chosen.subtitle}
                </ThemedText>
              ) : null}
            </>
          ) : (
            <ThemedText type="default" themeColor="placeholder">
              Select…
            </ThemedText>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {open ? '▴' : '▾'}
        </ThemedText>
      </Pressable>

      <Modal visible={mounted} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <View style={styles.overlay}>
          <Animated.View style={[styles.backdrop, { opacity: progress }]}>
            <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={close} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.background, marginBottom: keyboard, paddingBottom: keyboard ? Spacing.three : Math.max(insets.bottom, Spacing.three), transform: [{ translateY: slide }] },
            ]}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
            <View style={styles.header}>
              <ThemedText type="subtitle" style={styles.title} numberOfLines={1}>
                {label}
              </ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={close}>
                <ThemedText type="small" themeColor="primary">
                  Close
                </ThemedText>
              </Pressable>
            </View>

            {options.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {emptyText}
              </ThemedText>
            ) : (
              <>
                {options.length > SEARCH_FROM ? (
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search"
                    placeholderTextColor={theme.placeholder}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                    style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                  />
                ) : null}
                <FlatList
                  data={shown}
                  keyExtractor={(o) => o.id}
                  keyboardShouldPersistTaps="handled"
                  style={styles.list}
                  ListEmptyComponent={
                    <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                      No match.
                    </ThemedText>
                  }
                  renderItem={({ item }) => {
                    const selected = item.id === value;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          onChange(item.id);
                          close();
                        }}
                        android_ripple={{ color: theme.backgroundElement }}
                        style={({ pressed }) => [styles.row, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                        <View style={styles.flex}>
                          <ThemedText type={selected ? 'smallBold' : 'default'} themeColor={selected ? 'primary' : undefined}>
                            {item.name}
                          </ThemedText>
                          {item.subtitle ? (
                            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                              {item.subtitle}
                            </ThemedText>
                          ) : null}
                        </View>
                        {selected ? (
                          <ThemedText type="smallBold" themeColor="primary">
                            ✓
                          </ThemedText>
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              </>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  flex: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: { opacity: 0.55 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    width: '100%',
    maxWidth: 800,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: Spacing.one },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { flex: 1, fontSize: 20, lineHeight: 26 },
  search: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, minHeight: 44 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: { paddingVertical: Spacing.three },
});
