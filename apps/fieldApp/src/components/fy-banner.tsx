import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { selectFinancialYear, useFinancialYear } from '@/lib/financial-year';
import { useSessionUser } from '@/lib/session';

import { PrimaryButton } from './primary-button';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/** Shown on every screen that honours the financial-year switch while a past year is selected. Renders nothing otherwise. */
export function FyBanner() {
  const fy = useFinancialYear();
  const me = useSessionUser();
  if (!fy.isPast || !me) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="smallBold" themeColor="warning">
        {fy.closed ? `${fy.label} is closed. Read-only.` : `Viewing ${fy.label} · read only`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {fy.closed ? 'Admin has closed this year, so nothing dated in it can be added or changed.' : 'Nothing can be added or changed while you look at a past year.'}
      </ThemedText>
      <PrimaryButton label="Back to the current year" variant="text" onPress={() => selectFinancialYear(null, me.id)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.one },
});
