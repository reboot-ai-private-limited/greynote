import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColleagues, type Colleague } from '@/offline/colleagues';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** The server accepts at most this many colleagues on one day (planSchema `workWith.max(20)`). */
const MAX_PICKED = 20;

const GROUPS: { relation: Colleague['relation']; title: string }[] = [
  { relation: 'MANAGER', title: 'Your managers' },
  { relation: 'PEER', title: 'Under the same manager' },
  { relation: 'TEAM', title: 'Your team' },
];

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/**
 * "Work With": who joins you on a day or a call. Picks from the colleagues the server offers
 * (managers above you, peers under your manager, and your team). Chosen people show as chips;
 * the full list opens on demand so the form stays short.
 */
export function WorkWithPicker({ value, onChange, disabled }: Props) {
  const theme = useTheme();
  const { colleagues, loaded } = useColleagues();
  const [open, setOpen] = useState(false);
  const byId = new Map(colleagues.map((c) => [c.id, c]));

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < MAX_PICKED) onChange([...value, id]);
  };

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
                  {c ? c.name : 'Colleague'}  ✕
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        onPress={() => setOpen((o) => !o)}
        style={[styles.toggle, { borderColor: theme.border }, disabled && styles.disabled]}>
        <ThemedText type="small" themeColor="primary">
          {open ? 'Hide colleagues' : 'Add colleagues'}
        </ThemedText>
      </Pressable>

      {open ? (
        !loaded ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading colleagues…
          </ThemedText>
        ) : colleagues.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No colleagues to show yet. Connect to the internet once so your list can load.
          </ThemedText>
        ) : (
          GROUPS.map((g) => {
            const people = colleagues.filter((c) => c.relation === g.relation);
            if (people.length === 0) return null;
            return (
              <View key={g.relation} style={styles.group}>
                <ThemedText type="small" themeColor="textSecondary">
                  {g.title}
                </ThemedText>
                {people.map((c) => {
                  const picked = value.includes(c.id);
                  return (
                    <Pressable
                      key={c.id}
                      disabled={disabled || (!picked && value.length >= MAX_PICKED)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: picked }}
                      onPress={() => toggle(c.id)}>
                      <ThemedView
                        type="backgroundElement"
                        style={[styles.row, picked && { borderColor: theme.primary }]}>
                        <ThemedView type={picked ? 'primary' : 'backgroundSelected'} style={styles.tick}>
                          <ThemedText type="small" themeColor="onPrimary">
                            {picked ? '✓' : ''}
                          </ThemedText>
                        </ThemedView>
                        <ThemedView type="backgroundElement" style={styles.rowText}>
                          <ThemedText type="smallBold">{c.name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {[c.designation, c.employeeCode].filter(Boolean).join(' · ')}
                          </ThemedText>
                        </ThemedView>
                      </ThemedView>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  toggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  disabled: { opacity: 0.5 },
  group: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tick: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
});
