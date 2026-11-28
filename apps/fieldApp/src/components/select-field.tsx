import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  /** Small caption above the chosen value, so two side by side say what they filter. */
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** The list floats over what is below instead of pushing it down (2026-11-28, the Reports year). The parent needs a zIndex. */
  overlay?: boolean;
};

/**
 * A compact dropdown for a short list (a filter). The closed field shows the caption and the choice; opened, the options list under it.
 * Several can sit in one row: each takes an equal share (`flex: 1`).
 */
export function SelectField<T extends string>({ label, options, value, onChange, disabled, overlay }: Props<T>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const picked = options.find((o) => o.value === value);
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${picked?.label ?? ''}`}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { backgroundColor: theme.background, borderColor: open ? theme.primary : theme.border }, disabled && styles.dim]}>
        <View style={styles.text}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>{label}</ThemedText>
          <ThemedText type="small" numberOfLines={1}>{picked?.label ?? ''}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{open ? '▲' : '▼'}</ThemedText>
      </Pressable>
      {open ? (
        <View style={[styles.panel, overlay && styles.floating, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {options.map((o) => (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: o.value === value }}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={[styles.option, { borderBottomColor: theme.border }]}>
              <ThemedText type="small" themeColor={o.value === value ? 'primary' : 'text'}>{o.label}</ThemedText>
              {o.value === value ? <ThemedText type="smallBold" themeColor="primary">✓</ThemedText> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: Spacing.one, zIndex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 52 },
  text: { flex: 1 },
  caption: { fontSize: 11, lineHeight: 14 },
  panel: { borderWidth: 1, borderRadius: Spacing.three, overflow: 'hidden' },
  floating: { position: 'absolute', top: 56, left: 0, right: 0, zIndex: 10, elevation: 8, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  dim: { opacity: 0.5 },
});
