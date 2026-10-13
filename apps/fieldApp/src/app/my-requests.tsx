import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { ApprovalRow } from '@/components/approval-row';
import { ChoiceChips } from '@/components/choice-chips';
import { FyBanner } from '@/components/fy-banner';
import { Notice } from '@/components/notice';
import { ScreenShell } from '@/components/screen-shell';
import { Skeleton } from '@/components/skeleton';
import { listMine, type ApprovalItem, type ApprovalStatus } from '@/lib/approvals';
import { useFinancialYear } from '@/lib/financial-year';
import { useOnline } from '@/offline';
import { useCachedFetch } from '@/offline/cached-fetch';
import { formatWhen } from '@/offline/day';

type Filter = 'ALL' | 'WAITING' | 'APPROVED' | 'REJECTED';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'WAITING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const MATCH: Record<Filter, ApprovalStatus[] | null> = {
  ALL: null,
  WAITING: ['SUBMITTED', 'MANAGER_APPROVED'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
};

/**
 * My Requests (PRD §7.4): everything I have sent for approval — plans, plan changes, daily reports, leave, new doctors,
 * doctor services and monthly expenses — with where each one stands and, when it was rejected, why. Tap one to see its
 * history; a request still waiting can be withdrawn there. The list is kept on the phone, so it reads offline.
 */
export default function MyRequestsScreen() {
  const online = useOnline();
  const fy = useFinancialYear();
  const [filter, setFilter] = useState<Filter>('ALL');
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

  const shown = useMemo(() => {
    const statuses = MATCH[filter];
    const all = mine.data?.items ?? [];
    return statuses ? all.filter((i) => statuses.includes(i.status)) : all;
  }, [mine.data, filter]);

  return (
    <ScreenShell title="My Requests" onRefresh={mine.reload} refreshing={mine.refreshing}>
      <FyBanner />
      <ChoiceChips options={FILTERS} value={filter} onChange={setFilter} />

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
