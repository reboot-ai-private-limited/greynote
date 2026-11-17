import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';

import { ThemedText } from './themed-text';

/** A list row with its serial number (1, 2, 3 …) in a narrow column on the left. */
export function NumberedRow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.n}>
        {n}
      </ThemedText>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  n: { minWidth: 28, textAlign: 'right', paddingTop: Spacing.three },
  body: { flex: 1 },
});
