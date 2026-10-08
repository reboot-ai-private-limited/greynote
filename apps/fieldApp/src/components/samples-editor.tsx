import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export type SampleOption = { productId: string; name: string; packSize: string | null; available: number };
export type SampleLine = { productId: string; quantity: number };

type Props = {
  options: SampleOption[];
  value: SampleLine[];
  onChange: (lines: SampleLine[]) => void;
  disabled?: boolean;
};

/**
 * Samples given on a Doctor Call: only products the doctor has an allocation for, and never more
 * than what is left (the server draws the allocation down at Submit and refuses an overdraw).
 */
export function SamplesEditor({ options, value, onChange, disabled }: Props) {
  const theme = useTheme();
  const qty = (id: string) => value.find((l) => l.productId === id)?.quantity ?? 0;

  const set = (id: string, quantity: number) => {
    const rest = value.filter((l) => l.productId !== id);
    onChange(quantity > 0 ? [...rest, { productId: id, quantity }] : rest);
  };

  if (options.length === 0) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        This doctor has no sample allocation left.
      </ThemedText>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      {options.map((o) => {
        const n = qty(o.productId);
        return (
          <View key={o.productId} style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="default">{o.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${o.packSize ? `${o.packSize} · ` : ''}${o.available} left`}
              </ThemedText>
            </View>
            <Pressable
              accessibilityLabel={`Fewer ${o.name}`}
              disabled={disabled || n === 0}
              onPress={() => set(o.productId, n - 1)}
              style={[styles.step, { borderColor: theme.border }, (disabled || n === 0) && styles.dim]}>
              <ThemedText type="subtitle">−</ThemedText>
            </Pressable>
            <ThemedText type="smallBold" style={styles.count}>
              {n}
            </ThemedText>
            <Pressable
              accessibilityLabel={`More ${o.name}`}
              disabled={disabled || n >= o.available}
              onPress={() => set(o.productId, n + 1)}
              style={[styles.step, { borderColor: theme.border }, (disabled || n >= o.available) && styles.dim]}>
              <ThemedText type="subtitle">+</ThemedText>
            </Pressable>
          </View>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  step: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 24, textAlign: 'center' },
  dim: { opacity: 0.35 },
});
