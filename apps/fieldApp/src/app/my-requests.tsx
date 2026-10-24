import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApprovalRow } from '@/components/approval-row';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { OutletPicker } from '@/components/outlet-picker';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { Spacing } from '@/constants/theme';
import { APPROVAL_KINDS, isOneApproval, kindLabel, listMine, type ApprovalItem } from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen } from '@/offline/day';

const ALL = 'ALL';

type StatusFilter = typeof ALL | 'WAITING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'REOPENED';

const STATUS_OPTIONS: { id: StatusFilter; name: string }[] = [
  { id: ALL, name: 'All statuses' },
  { id: 'WAITING', name: 'Waiting' },
  { id: 'APPROVED', name: 'Approved' },
  { id: 'REJECTED', name: 'Rejected' },
  { id: 'WITHDRAWN', name: 'Withdrawn' },
  { id: 'REOPENED', name: 'Reopened' },
];

/**
 * Which status group a request falls in, the same way its row words it (`statusLabel`): a one-approval request left at
 * `MANAGER_APPROVED` is approved, while a two-step one at `MANAGER_APPROVED` is still waiting, for Admin.
 */
function statusGroup(i: ApprovalItem): Exclude<StatusFilter, typeof ALL> {
  if (i.status === 'MANAGER_APPROVED') return isOneApproval(i) ? 'APPROVED' : 'WAITING';
  if (i.status === 'SUBMITTED') return 'WAITING';
  return i.status;
}

/**
 * My Requests (PRD §7.4): everything I have sent for approval — plans, plan changes, daily reports, leave, new doctors,
 * doctor services and monthly expenses — with where each one stands and, when it was rejected, why. Tap one to see its
 * history; a request still waiting can be withdrawn there. The list is kept on the phone, so it reads offline.
 */
export default function MyRequestsScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const [kind, setKind] = useState<string>(ALL);
  const [status, setStatus] = useState<StatusFilter>(ALL);
  const mine = useCachedFetch<{ items: ApprovalItem[]; total: number }>(`mine:${fy.year}`, () => listMine());

  // Coming back from a request (it may have been withdrawn there) shows its new state; the first focus is the initial load.
  const focused = useRef(false);
  const { reload } = mine;
  useFocusEffect(
    useCallback(() => {
      if (focused.current) reload();
      focused.current = true;
    }, [reload]),
  );

  // Every request type, plus any the server sent that this app doesn't know yet.
  const kindOptions = useMemo(() => {
    const kinds = [...APPROVAL_KINDS] as string[];
    for (const i of mine.data?.items ?? []) if (!kinds.includes(i.kind)) kinds.push(i.kind);
    return [{ id: ALL, name: 'All types' }, ...kinds.map((k) => ({ id: k, name: kindLabel(k) }))];
  }, [mine.data]);

  const shown = useMemo(
    () => (mine.data?.items ?? []).filter((i) => (kind === ALL || i.kind === kind) && (status === ALL || statusGroup(i) === status)),
    [mine.data, kind, status],
  );

  return (
    <ScreenShell title="My Requests" onRefresh={mine.reload} refreshing={mine.refreshing}>
      <FyBanner />
      <View style={styles.filters}>
        <View style={styles.filter}>
          <OutletPicker label="Type" options={kindOptions} value={kind} onChange={setKind} emptyText="No types." />
        </View>
        <View style={styles.filter}>
          <OutletPicker label="Status" options={STATUS_OPTIONS} value={status} onChange={(id) => setStatus(id as StatusFilter)} emptyText="No statuses." />
        </View>
      </View>

      {mine.stale && mine.fetchedAt && mine.data ? (
        <Notice tone="info">{`${online ? 'Updating… ' : 'You’re offline. '}Showing the list from ${formatWhen(mine.fetchedAt)}.`}</Notice>
      ) : null}
      {mine.error && !mine.data ? <Notice tone="danger">{mine.error}</Notice> : null}
      {mine.loading && !mine.data ? <Skeleton cards={3} lines={3} /> : null}
      {!mine.loading && !mine.data && !mine.error && !online ? (
        <Notice tone="info">You’re offline and this list hasn’t been loaded yet. Connect to the internet once to see your requests.</Notice>
      ) : null}

      {mine.data && shown.length === 0 ? (
        <Notice tone="info">
          {mine.data.items.length === 0 ? 'You haven’t sent anything for approval yet.' : 'No requests match this filter.'}
        </Notice>
      ) : null}

      {shown.map((item) => (
        <ApprovalRow
          key={item.id}
          item={item}
          own
          onPress={() => (online ? router.push({ pathname: '/approval/[id]', params: { id: item.id } }) : undefined)}
        />
      ))}
      {mine.data && mine.data.total > mine.data.items.length ? (
        <Notice tone="info">{`Showing your latest ${mine.data.items.length} of ${mine.data.total} requests.`}</Notice>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: Spacing.two },
  filter: { flex: 1 },
});
