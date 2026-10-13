import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

type Props<T extends string> = {
  /** `badge`: a count shown in a small red circle after the label (hidden at 0). */
  options: { value: T; label: string; badge?: number | null }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
};

/** A small two-or-three way switch: a rounded track with the chosen option as a white pill. */
export function PillToggle<T extends string>({ options, value, onChange, disabled }: Props<T>) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: '#EAF1FB', borderColor: '#DCE7F6' }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            onPress={() => onChange(o.value)}
            style={[styles.option, selected && { backgroundColor: theme.background }, selected && styles.selected]}>
            <View style={styles.labelRow}>
              <ThemedText type="smallBold" themeColor={selected ? 'primary' : 'textSecondary'} numberOfLines={1}>
                {o.label}
              </ThemedText>
              {o.badge ? (
                <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                  <ThemedText type="smallBold" themeColor="onPrimary" style={styles.badgeText}>
                    {o.badge > 99 ? '99+' : String(o.badge)}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, lineHeight: 14 },
  track: { flexDirection: 'row', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 4 },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 8 },
  selected: {
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
