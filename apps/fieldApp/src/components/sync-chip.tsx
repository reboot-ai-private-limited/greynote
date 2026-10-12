import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useOnline } from '@/offline/connectivity';
import { useOutboxCounts, useSyncStatus } from '@/offline/hooks';

import { ThemedText } from './themed-text';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** The status strip at the bottom of the Home header: connection, unsent records, and when reference data last refreshed. Sits on the blue header, so it is white-on-translucent. */
export function SyncChip() {
  const online = useOnline();
  const counts = useOutboxCounts();
  const { syncing, lastPullAt, lastError } = useSyncStatus();
  const unsent = counts.DRAFT + counts.QUEUED + counts.FAILED;

  const parts = [
    syncing ? 'Syncing…' : online ? 'Online' : 'Offline',
    unsent > 0 ? `${unsent} unsent` : 'All sent',
    `Updated ${ago(lastPullAt)}`,
  ];
  return (
    <View style={styles.chip}>
      <ThemedText type="small" style={styles.text}>
        {parts.join('  |  ')}
      </ThemedText>
      {counts.FAILED > 0 ? (
        <ThemedText type="small" style={styles.alert}>
          {counts.FAILED} record{counts.FAILED === 1 ? '' : 's'} failed — open Summary to fix.
        </ThemedText>
      ) : null}
      {lastError ? (
        <ThemedText type="small" style={styles.warning}>
          {lastError}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    gap: Spacing.half,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'stretch',
  },
  text: { color: '#FFFFFF', fontSize: 12, lineHeight: 18 },
  alert: { color: '#FFD9D9', fontSize: 12, lineHeight: 18 },
  warning: { color: '#FFE9B8', fontSize: 12, lineHeight: 18 },
});
