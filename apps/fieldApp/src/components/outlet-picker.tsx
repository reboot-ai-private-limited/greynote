import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

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

/**
 * Picks one doctor or chemist from the phone's cached list. Shows the chosen one; tapping opens a
 * searchable list so a few hundred names stay quick to scan.
 */
export function OutletPicker({ label, options, value, onChange, disabled, emptyText }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const chosen = options.find((o) => o.id === value) ?? null;
  const needle = query.trim().toLowerCase();
  const shown = (needle ? options.filter((o) => `${o.name} ${o.subtitle ?? ''}`.toLowerCase().includes(needle)) : options).slice(0, 50);

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: open ? theme.primary : 'transparent' }, disabled && styles.disabled]}>
        <View style={styles.flex}>
          <ThemedText type="default">{chosen ? chosen.name : 'Select…'}</ThemedText>
          {chosen?.subtitle ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {chosen.subtitle}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="primary">
          {open ? 'Close' : chosen ? 'Change' : 'Choose'}
        </ThemedText>
      </Pressable>

      {open ? (
        <ThemedView type="backgroundElement" style={styles.list}>
          {options.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {emptyText}
            </ThemedText>
          ) : (
            <>
              <TextField label="Search" value={query} onChangeText={setQuery} placeholder="Name or place" autoCorrect={false} />
              {shown.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  No match.
                </ThemedText>
              ) : (
                shown.map((o) => (
                  <Pressable
                    key={o.id}
                    accessibilityRole="button"
                    onPress={() => {
                      onChange(o.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    style={[styles.row, { borderColor: theme.border }, o.id === value && { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText type="default">{o.name}</ThemedText>
                    {o.subtitle ? (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {o.subtitle}
                      </ThemedText>
                    ) : null}
                  </Pressable>
                ))
              )}
              {options.length > shown.length && !needle ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Showing the first {shown.length} — search to narrow down.
                </ThemedText>
              ) : null}
            </>
          )}
        </ThemedView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  flex: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three },
  list: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  row: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  disabled: { opacity: 0.6 },
});
