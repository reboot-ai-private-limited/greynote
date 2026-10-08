import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useOnline } from '@/offline/connectivity';
import { useOutboxCounts } from '@/offline/hooks';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/**
 * A strip at the very top while the phone has no connection. Work carries on: calls, followups
 * and expenses are saved on the phone; only Plan Submit and Final Submission wait for a signal.
 */
export function OfflineBanner() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const counts = useOutboxCounts();
  if (online) return null;

  const unsent = counts.DRAFT + counts.QUEUED + counts.FAILED;
  return (
    <ThemedView type="warning" style={[styles.bar, { paddingTop: insets.top + Spacing.one }]}>
      <ThemedText type="small" themeColor="onPrimary" style={styles.text}>
        You’re offline — your work is saved on this phone
        {unsent > 0 ? ` (${unsent} unsent)` : ''}.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingBottom: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  text: { textAlign: 'center' },
});
