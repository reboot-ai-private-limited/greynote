import { useEffect, useState } from 'react';
import { Animated, Dimensions, FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { DoctorAvatar } from './doctor-avatar';
import { ThemedText } from './themed-text';

/** `disabled` greys an option out and it can't be picked; its subtitle should say why. */
export type OutletOption = { id: string; name: string; subtitle?: string; disabled?: boolean; /** A doctor's photo (`avatars` on). */ photoUrl?: string | null };

type Props = {
  label: string;
  options: OutletOption[];
  value?: string | null;
  onChange?: (id: string) => void;
  /**
   * Several choices at once (the routes of a Tour Plan day): give `values` and `onChangeValues` instead of `value` and `onChange`. The
   * sheet stays open while rows are ticked and closes with Done; the closed field lists the chosen names.
   */
  multiple?: boolean;
  values?: string[];
  onChangeValues?: (ids: string[]) => void;
  disabled?: boolean;
  /** Shown when `options` is empty — say why (no plan routes, nothing synced yet…). */
  emptyText: string;
  /** Always offer the search box, however short the list (it searches the name and the subtitle). */
  searchable?: boolean;
  /** Doctors: each option shows its photo, or its initials. */
  avatars?: boolean;
  /**
   * The list is searched by the caller (the server), not here: `onSearch` is called with the text about 300 ms after the last
   * key, and `options` are shown as given. `onEndReached` loads the next page, `loading` shows a note under the list.
   */
  onSearch?: (text: string) => void;
  onEndReached?: () => void;
  loading?: boolean;
  /** The chosen option, shown in the closed field even when the current search no longer lists it. */
  selectedOption?: OutletOption | null;
  /** The search box's placeholder (default "Search"). */
  searchPlaceholder?: string;
};

/** A search box is only worth its space once the list is longer than this. */
const SEARCH_FROM = 6;

/**
 * The app's one dropdown (doctors, chemists, products, routes, people…). The closed field is a plain outlined
 * box — label above, the choice inside, a chevron at the end — and tapping it opens a bottom sheet with an
 * optional search and the options. The chosen option is marked with a tick and the primary colour, never a
 * filled background, so the form around it keeps its look.
 */
export function OutletPicker({ label, options, value = null, onChange, multiple, values = [], onChangeValues, disabled, emptyText, searchable, avatars, onSearch, onEndReached, loading, selectedOption, searchPlaceholder }: Props) {
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
  const chosen = options.find((o) => o.id === value) ?? (selectedOption?.id === value ? selectedOption : null);
  const chosenMany = multiple ? options.filter((o) => values.includes(o.id)) : [];
  const needle = query.trim().toLowerCase();
  // With `onSearch` the caller has already searched; otherwise the list is filtered here.
  const shown = needle && !onSearch ? options.filter((o) => `${o.name} ${o.subtitle ?? ''}`.toLowerCase().includes(needle)) : options;

  // Tell the caller what was typed once the typing pauses.
  useEffect(() => {
    if (!onSearch || !open) return;
    const timer = setTimeout(() => onSearch(query.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new query should search again
  }, [query, open]);

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
        {avatars && chosen && !multiple ? <DoctorAvatar name={chosen.name} photoUrl={chosen.photoUrl} size={36} /> : null}
        <View style={styles.flex}>
          {multiple ? (
            chosenMany.length > 0 ? (
              <ThemedText type="default" numberOfLines={2}>
                {chosenMany.map((o) => o.name).join(', ')}
              </ThemedText>
            ) : (
              <ThemedText type="default" themeColor="placeholder">
                Select…
              </ThemedText>
            )
          ) : chosen ? (
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
                  {multiple ? 'Done' : 'Close'}
                </ThemedText>
              </Pressable>
            </View>

            {options.length === 0 && !onSearch ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {emptyText}
              </ThemedText>
            ) : (
              <>
                {searchable || onSearch || options.length > SEARCH_FROM ? (
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={searchPlaceholder ?? 'Search'}
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
                  onEndReached={onEndReached}
                  onEndReachedThreshold={0.5}
                  ListEmptyComponent={
                    loading ? null : (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                        {onSearch ? (query.trim() ? 'No doctor matches' : emptyText) : 'No match.'}
                      </ThemedText>
                    )
                  }
                  ListFooterComponent={
                    loading ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                        Loading…
                      </ThemedText>
                    ) : null
                  }
                  renderItem={({ item }) => {
                    const selected = multiple ? values.includes(item.id) : item.id === value;
                    return (
                      <Pressable
                        accessibilityRole={multiple ? 'checkbox' : 'button'}
                        accessibilityState={{ selected, checked: multiple ? selected : undefined, disabled: item.disabled }}
                        disabled={item.disabled}
                        onPress={() => {
                          if (multiple) {
                            // Tick or untick and stay open, so several can be chosen; the list keeps the order the options came in.
                            onChangeValues?.(selected ? values.filter((v) => v !== item.id) : [...values, item.id]);
                            return;
                          }
                          onChange?.(item.id);
                          close();
                        }}
                        android_ripple={{ color: theme.backgroundElement }}
                        style={({ pressed }) => [
                          styles.row,
                          { borderColor: theme.border },
                          pressed && { backgroundColor: theme.backgroundElement },
                          item.disabled && styles.disabled,
                        ]}>
                        {avatars ? <DoctorAvatar name={item.name} photoUrl={item.photoUrl} size={40} /> : null}
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
