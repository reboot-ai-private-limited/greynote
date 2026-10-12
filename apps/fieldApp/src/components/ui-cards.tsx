import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Accents, Spacing, type Accent } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';

/** The building blocks the manager screens share, so they read like Home: pastel chips, white bordered cards, rounded pills. */

export const sym = (ios: string, android: string): SymbolViewProps['name'] => ({ ios, android, web: android }) as SymbolViewProps['name'];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A coloured square with an icon in it. */
export function IconChip({ icon, accent, size = 36 }: { icon: SymbolViewProps['name']; accent: Accent; size?: number }) {
  return (
    <View style={[styles.chip, { width: size, height: size, backgroundColor: Accents[accent].bg }]}>
      <SymbolView name={icon} size={size * 0.55} tintColor={Accents[accent].solid} />
    </View>
  );
}

/** A white card with an icon, a title, an optional count, and the content under it. */
export function CardSection({
  icon,
  accent,
  title,
  count,
  children,
}: {
  icon: SymbolViewProps['name'];
  accent: Accent;
  title: string;
  count?: number | string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <IconChip icon={icon} accent={accent} />
        <ThemedText type="smallBold" style={styles.cardTitle}>
          {title}
        </ThemedText>
        {count !== undefined ? (
          <View style={[styles.count, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.countText}>
              {count}
            </ThemedText>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Avatar({ name, accent = 'blue', size = 40 }: { name: string; accent?: Accent; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: Accents[accent].bg }]}>
      <ThemedText type="smallBold" style={{ color: Accents[accent].solid, fontSize: size * 0.34, lineHeight: size * 0.45 }}>
        {initials(name)}
      </ThemedText>
    </View>
  );
}

/** A small rounded label. */
export function Pill({ text, accent }: { text: string; accent: Accent }) {
  return (
    <View style={[styles.pill, { backgroundColor: Accents[accent].bg, borderColor: Accents[accent].border }]}>
      <ThemedText type="smallBold" style={[styles.pillText, { color: Accents[accent].solid }]} numberOfLines={1}>
        {text}
      </ThemedText>
    </View>
  );
}

/** One person to choose from (radio style): avatar, name, code and designation. */
export function PersonOption({
  name,
  detail,
  selected,
  disabled,
  onPress,
}: {
  name: string;
  detail: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.person,
        { backgroundColor: selected ? Accents.blue.bg : theme.background, borderColor: selected ? theme.primary : theme.border },
      ]}>
      <Avatar name={name} accent={selected ? 'blue' : 'slate'} />
      <View style={styles.personText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.small}>
          {detail}
        </ThemedText>
      </View>
      <View style={[styles.radio, { borderColor: selected ? theme.primary : theme.border }]}>
        {selected ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * A select box for choosing one person: it shows who is picked (or a prompt), and opens a bordered panel below it with a search
 * box and a scrolling list. Picking someone closes it.
 */
export function PersonDropdown({
  people,
  value,
  onChange,
  placeholder = 'Select employee',
  disabled,
}: {
  people: { id: string; name: string; detail: string }[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const picked = people.find((p) => p.id === value) ?? null;
  const needle = search.trim().toLowerCase();
  const shown = needle ? people.filter((p) => p.name.toLowerCase().includes(needle) || p.detail.toLowerCase().includes(needle)) : people;

  return (
    <View style={styles.dropWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((o) => !o)}
        style={[styles.select, { backgroundColor: theme.background, borderColor: open ? theme.primary : theme.border }, disabled && styles.dim]}>
        {picked ? <Avatar name={picked.name} accent="blue" size={32} /> : null}
        <View style={styles.personText}>
          <ThemedText type="small" themeColor={picked ? 'text' : 'textSecondary'} numberOfLines={1} style={picked ? styles.selectName : undefined}>
            {picked ? picked.name : placeholder}
          </ThemedText>
          {picked ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.small}>
              {picked.detail}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {open ? '▲' : '▼'}
        </ThemedText>
      </Pressable>

      {open ? (
        <View style={[styles.panel, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {people.length > 5 ? <TextField label="Search by name or code" value={search} onChangeText={setSearch} autoCapitalize="none" /> : null}
          <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {shown.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No matching employees.
              </ThemedText>
            ) : (
              shown.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: p.id === value }}
                  onPress={() => {
                    onChange(p.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  style={[styles.option, { borderBottomColor: theme.border }, p.id === value && { backgroundColor: Accents.blue.bg }]}>
                  <Avatar name={p.name} accent={p.id === value ? 'blue' : 'slate'} size={34} />
                  <View style={styles.personText}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {p.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.small}>
                      {p.detail}
                    </ThemedText>
                  </View>
                  {p.id === value ? <ThemedText type="smallBold" themeColor="primary">✓</ThemedText> : null}
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** A plain white bordered card (no header), for one record or a block of related lines. */
export function InfoCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>{children}</View>;
}

/** A tappable list row: an icon chip, two lines of text and something on the right (a value, a pill). */
export function RowCard({
  icon,
  accent,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon: SymbolViewProps['name'];
  accent: Accent;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View style={[styles.rowCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <IconChip icon={icon} accent={accent} />
      <View style={styles.personText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.small} numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** A row of small figures (a count, a total) at the top of a list. */
export function SummaryStrip({ items }: { items: { label: string; value: string | number; accent: Accent }[] }) {
  return (
    <View style={styles.strip}>
      {items.map((i) => (
        <View key={i.label} style={[styles.stat, { backgroundColor: Accents[i.accent].bg, borderColor: Accents[i.accent].border }]}>
          <ThemedText type="smallBold" style={{ color: Accents[i.accent].solid, fontSize: 22, lineHeight: 28 }} numberOfLines={1} adjustsFontSizeToFit>
            {i.value}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.small} numberOfLines={1}>
            {i.label}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** The coloured banner under a screen's title: what state this record is in. */
export function StatusBanner({ accent, icon, title, text }: { accent: Accent; icon: SymbolViewProps['name']; title: string; text?: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: Accents[accent].bg, borderColor: Accents[accent].border }]}>
      <IconChip icon={icon} accent={accent} size={32} />
      <View style={styles.personText}>
        <ThemedText type="smallBold" style={{ color: Accents[accent].solid }}>
          {title}
        </ThemedText>
        {text ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.small}>
            {text}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

/** A filled bar showing part of a whole. */
export function Meter({ value, total, accent }: { value: number; total: number; accent: Accent }) {
  const theme = useTheme();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={[styles.meter, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.meterFill, { width: `${ratio * 100}%`, backgroundColor: Accents[accent].solid }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three, gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { flex: 1, fontSize: 16, lineHeight: 22 },
  count: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  countText: { fontSize: 12, lineHeight: 16 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 10 },
  pillText: { fontSize: 11, lineHeight: 16 },
  person: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.two + 2 },
  personText: { flex: 1 },
  small: { fontSize: 12, lineHeight: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  dropWrap: { gap: Spacing.two },
  select: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, minHeight: 52 },
  selectName: { fontWeight: 700 },
  dim: { opacity: 0.5 },
  panel: { borderWidth: 1, borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.two, shadowColor: '#0F172A', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  list: { maxHeight: 260 },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: Spacing.two },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  strip: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.two + 2, gap: 2 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, borderWidth: 1, padding: Spacing.three },
  meter: { height: 8, borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4 },
});
