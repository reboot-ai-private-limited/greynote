import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { Feature } from '@/features/catalog';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

const LOCK: SymbolViewProps['name'] = { ios: 'lock', android: 'lock', web: 'lock' } as SymbolViewProps['name'];

type Props = {
  feature: Feature;
  /** Why the tile is locked; null when it can be opened. */
  lockedReason: string | null;
  onOpen: () => void;
  onLockedPress: (reason: string) => void;
};

/** One Home tile. A locked tile stays visible (and tappable, to explain itself) but dimmed. */
export function FeatureTile({ feature, lockedReason, onOpen, onLockedPress }: Props) {
  const theme = useTheme();
  const locked = lockedReason !== null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      accessibilityLabel={locked ? `${feature.title}, locked` : feature.title}
      onPress={() => (lockedReason !== null ? onLockedPress(lockedReason) : onOpen())}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}>
      <ThemedView type="backgroundElement" style={[styles.tile, locked && styles.locked]}>
        <SymbolView
          name={locked ? LOCK : feature.icon}
          size={26}
          tintColor={locked ? theme.textSecondary : theme.primary}
        />
        <ThemedText type="small" numberOfLines={2} style={styles.label} themeColor={locked ? 'textSecondary' : 'text'}>
          {feature.title}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { flex: 1 },
  pressed: { opacity: 0.7 },
  tile: {
    minHeight: 92,
    borderRadius: Spacing.three,
    padding: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  locked: { opacity: 0.6 },
  // Fill the tile so Android doesn't shrink-wrap the text and clip the last word.
  label: { textAlign: 'center', alignSelf: 'stretch' },
});
