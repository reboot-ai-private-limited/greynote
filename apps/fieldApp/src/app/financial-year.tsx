import { Pressable, StyleSheet, View } from 'react-native';

import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fyRange, selectFinancialYear, useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';
import { prettyDay } from '@/offline/day';

/**
 * Financial Year (PRD §6.2): look back at a past financial year. The Reports, the Holiday List and the Orders
 * list then show that year, read-only; nothing can be added or changed until you return to the current year.
 */
export default function FinancialYearScreen() {
  const fy = useFinancialYear();
  const me = useSessionUser();
  const theme = useTheme();

  return (
    <ScreenShell title="Financial Year">
      <Notice tone={fy.isPast ? 'warning' : 'info'} title={fy.closed ? `${fy.label} is closed. Read-only.` : fy.isPast ? `Viewing ${fy.label}` : 'Current year'}>
        {fy.isPast
          ? 'Reports, Holidays and Orders show this past year and are read-only. Pick the current year to go back to normal.'
          : 'Pick a past year to look back at it. It is read-only, and your own work stays as it is.'}
      </Notice>

      {fy.options.map((o) => {
        const range = fyRange(o.year, fy.startMonth);
        const chosen = o.year === fy.year;
        return (
          <Pressable
            key={o.year}
            accessibilityRole="radio"
            accessibilityState={{ selected: chosen }}
            onPress={() => me && selectFinancialYear(o.year === fy.current ? null : o.year, me.id)}>
            <ThemedView type="backgroundElement" style={[styles.row, chosen && { borderColor: theme.primary, borderWidth: 2 }]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{o.year === fy.current ? `${o.label} · current` : fy.closedYears.includes(o.year) ? `${o.label} · closed` : o.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{`${prettyDay(range.from)} ${range.from.slice(0, 4)} – ${prettyDay(range.to)} ${range.to.slice(0, 4)}`}</ThemedText>
              </View>
              {chosen ? (
                <ThemedText type="smallBold" themeColor="primary">
                  Selected
                </ThemedText>
              ) : null}
            </ThemedView>
          </Pressable>
        );
      })}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.half },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Spacing.three, padding: Spacing.three, borderWidth: 2, borderColor: 'transparent' },
});
