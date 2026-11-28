import { Pressable, StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useOnline } from '@/offline/connectivity';
import { useOutboxCounts, useSyncNow, useSyncStatus } from '@/offline/hooks';

import { ThemedText } from './themed-text';

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

/**
 * The status strip at the bottom of the Home header: connection, unsent records, and when reference data last refreshed. A tap syncs now
 * (2026-11-28). Sits on the blue header, so it is white-on-translucent.
 */
export function SyncChip() {
  const online = useOnline();
  const counts = useOutboxCounts();
  const { syncing, lastPullAt, lastError } = useSyncStatus();
  const unsent = counts.DRAFT + counts.QUEUED + counts.FAILED;
  const sync = useSyncNow();

  const parts = [
    syncing ? 'Syncing…' : online ? 'Online' : 'Offline',
    unsent > 0 ? `${unsent} unsent` : 'All sent',
    `Updated ${ago(lastPullAt)}`,
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${parts.join(', ')}. Sync now`}
      accessibilityState={{ busy: syncing, disabled: sync.busy }}
      disabled={sync.busy}
      onPress={() => void sync.run()}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
      <ThemedText type="small" style={styles.text}>
        {parts.join('  |  ')}
        {syncing ? '' : '  ·  ↻ Sync'}
      </ThemedText>
      {sync.message && !lastError ? (
        <ThemedText type="small" style={styles.warning}>
          {sync.message}
        </ThemedText>
      ) : null}
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
    </Pressable>
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
  pressed: { opacity: 0.7 },
  text: { color: '#FFFFFF', fontSize: 12, lineHeight: 18 },
  alert: { color: '#FFD9D9', fontSize: 12, lineHeight: 18 },
  warning: { color: '#FFE9B8', fontSize: 12, lineHeight: 18 },
});
