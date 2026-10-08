import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useOnline } from '@/offline/connectivity';
import { useOutboxCounts, useSyncStatus } from '@/offline/hooks';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/** One line on the Home header: connection, unsent records, and when reference data last refreshed. */
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
    <ThemedView type="backgroundElement" style={styles.chip}>
      <ThemedText type="small" themeColor="textSecondary">
        {parts.join(' · ')}
      </ThemedText>
      {counts.FAILED > 0 ? (
        <ThemedText type="small" themeColor="danger">
          {counts.FAILED} record{counts.FAILED === 1 ? '' : 's'} failed — open Summary to fix.
        </ThemedText>
      ) : null}
      {lastError ? (
        <ThemedText type="small" themeColor="warning">
          {lastError}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: Spacing.three, padding: Spacing.two, gap: Spacing.half },
});
