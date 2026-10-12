import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColleagues } from '@/offline/colleagues';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** The server accepts at most this many colleagues on one day (planSchema `workWith.max(20)`). */
const MAX_PICKED = 20;

type Scope = 'MANAGERS' | 'ALL';
const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: 'MANAGERS', label: 'Managers' },
  { value: 'ALL', label: 'All colleagues' },
];

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/**
 * "Work With": who joins you on a day or a call (GET /identity/work-with).
 * Offers active managers or all field employees. Shows labels like "Asha Rao (ASM)".
 */
export function WorkWithPicker({ value, onChange, disabled }: Props) {
  const theme = useTheme();
  const { colleagues, loaded } = useColleagues();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>('MANAGERS');
  const [search, setSearch] = useState('');
  const byId = useMemo(() => new Map(colleagues.map((c) => [c.id, c])), [colleagues]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_PICKED) onChange([...value, id]);
  };

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = scope === 'MANAGERS' ? colleagues.filter((c) => c.isManager || c.relation === 'MANAGER') : colleagues;
    // If no managers were found, fall back to showing everyone so the picker is never empty
    if (scope === 'MANAGERS' && list.length === 0) list = colleagues;
    if (needle) {
      list = list.filter((c) => c.name.toLowerCase().includes(needle) || c.employeeCode.toLowerCase().includes(needle) || (c.designation ?? '').toLowerCase().includes(needle));
    }
    return list;
  }, [colleagues, scope, needle]);

  return (
    <View style={styles.box}>
      <ThemedText type="smallBold">Work with (optional)</ThemedText>

      {value.length > 0 ? (
        <View style={styles.chips}>
          {value.map((id) => {
            const c = byId.get(id);
            return (
              <Pressable
                key={id}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c?.name ?? 'colleague'}`}
                onPress={() => toggle(id)}
                style={[styles.chip, { backgroundColor: theme.primary }]}>
                <ThemedText type="small" themeColor="onPrimary">
                  {c?.label ?? c?.name ?? 'Colleague'}  ✕
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* The select box: tapping it drops the colleague list down just below it. */}
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={[
          styles.select,
          { backgroundColor: theme.background, borderColor: open ? theme.primary : theme.border },
          disabled && styles.disabled,
        ]}>
        <ThemedText type="small" themeColor={value.length > 0 ? 'text' : 'textSecondary'} style={styles.selectText}>
          {value.length > 0 ? `${value.length} colleague${value.length === 1 ? '' : 's'} selected` : 'Add colleagues'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {open ? '▲' : '▼'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={[styles.dropdown, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {!loaded ? (
            <ThemedText type="small" themeColor="textSecondary">
              Loading colleagues…
            </ThemedText>
          ) : colleagues.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No colleagues to show yet. Connect to the internet once so your list can load.
            </ThemedText>
          ) : (
            <>
              <ChoiceChips options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
              <TextField
                label="Search colleague"
                placeholder="Name, code or designation…"
                value={search}
                onChangeText={setSearch}
              />
              {/* A fixed-height, scrollable list, so a long team doesn't push the rest of the form away. */}
              <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filtered.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    No matching colleagues.
                  </ThemedText>
                ) : (
                  filtered.map((c) => {
                    const picked = value.includes(c.id);
                    return (
                      <Pressable
                        key={c.id}
                        disabled={disabled || (!picked && value.length >= MAX_PICKED)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: picked }}
                        onPress={() => toggle(c.id)}
                        style={[styles.row, { borderBottomColor: theme.border }, picked && { backgroundColor: theme.backgroundElement }]}>
                        <ThemedView type={picked ? 'primary' : 'backgroundSelected'} style={styles.tick}>
                          <ThemedText type="small" themeColor="onPrimary">
                            {picked ? '✓' : ''}
                          </ThemedText>
                        </ThemedView>
                        <View style={styles.rowText}>
                          <ThemedText type="smallBold">{c.label ?? c.name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {[c.employeeCode, c.designation].filter(Boolean).join(' · ')}
                          </ThemedText>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
              <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}>
                <ThemedText type="smallBold" themeColor="primary">
                  Done
                </ThemedText>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  selectText: { flex: 1 },
  disabled: { opacity: 0.5 },
  dropdown: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.two,
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  list: { maxHeight: 240 },
  empty: { padding: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  done: { alignSelf: 'flex-end', paddingVertical: Spacing.one, paddingHorizontal: Spacing.two },
  tick: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
});
