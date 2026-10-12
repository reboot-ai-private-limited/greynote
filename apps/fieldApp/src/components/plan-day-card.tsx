import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { workingTypeLabel, type PlanDay } from '@/lib/planning';
import { OFF_COLORS, typeColors } from '@/lib/plan-style';
import type { Colleague } from '@/offline/colleagues';
import { weekdayName } from '@/offline/day';

import { ThemedText } from './themed-text';

const PENCIL: SymbolViewProps['name'] = { ios: 'pencil', android: 'edit', web: 'edit' } as SymbolViewProps['name'];

type Props = {
  date: string;
  entry: PlanDay | undefined;
  off: boolean;
  /** The plan can be edited, so a working day can be tapped. */
  editable: boolean;
  names: { routes: Map<string, string>; colleagues: Map<string, Colleague> };
  onPress: () => void;
};

/** One day of the month: a coloured date block, the type, where, and who with. */
export function PlanDayCard({ date, entry, off, editable, names, onPress }: Props) {
  const theme = useTheme();
  const colors = off ? OFF_COLORS : entry ? typeColors(entry.workingType) : null;

  const routes = entry ? entry.routeIds.map((id) => names.routes.get(id) ?? 'Route') : [];
  const people = entry ? entry.workWith.map((id) => names.colleagues.get(id)?.name ?? 'Colleague') : [];
  const title = off
    ? 'Weekly off'
    : entry
      ? routes.length > 0
        ? routes.join(', ')
        : (entry.remarks ?? workingTypeLabel(entry.workingType))
      : editable
        ? 'Tap to plan'
        : 'Not planned';
  const subtitle = off
    ? 'No activity planned'
    : entry
      ? [people.length > 0 ? `With ${people.join(', ')}` : null, routes.length > 0 ? entry.remarks : null].filter(Boolean).join(' · ')
      : null;

  const tappable = editable && !off;
  return (
    <Pressable
      disabled={!tappable}
      accessibilityRole="button"
      accessibilityLabel={`${date}, ${title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.border },
        off && styles.off,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.date, { backgroundColor: colors ? colors.bg : theme.backgroundElement }]}>
        <ThemedText type="smallBold" style={[styles.dayNum, { color: colors ? colors.solid : theme.textSecondary }]}>
          {Number(date.slice(8))}
        </ThemedText>
        <ThemedText type="small" style={[styles.dayName, { color: colors ? colors.solid : theme.textSecondary }]}>
          {weekdayName(date).toUpperCase()}
        </ThemedText>
      </View>
      <View style={styles.text}>
        {entry && !off && colors ? (
          <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <View style={[styles.badgeDot, { backgroundColor: colors.solid }]} />
            <ThemedText type="small" style={[styles.badgeText, { color: colors.solid }]}>
              {workingTypeLabel(entry.workingType)}
            </ThemedText>
          </View>
        ) : null}
        <ThemedText type="smallBold" themeColor={entry ? 'text' : 'textSecondary'} numberOfLines={2}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {tappable ? (
        <View style={[styles.edit, { borderColor: theme.border }]}>
          <SymbolView name={PENCIL} size={16} tintColor={theme.textSecondary} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.two + 2,
  },
  off: { opacity: 0.6 },
  pressed: { opacity: 0.75 },
  date: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 18, lineHeight: 22 },
  dayName: { fontSize: 10, lineHeight: 12, fontWeight: 600 },
  text: { flex: 1, gap: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, lineHeight: 16, fontWeight: 600 },
  subtitle: { fontSize: 12, lineHeight: 16 },
  edit: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
