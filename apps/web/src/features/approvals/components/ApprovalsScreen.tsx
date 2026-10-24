'use client';

import type { ApprovalInboxItemDto, ApprovalStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { ListToolbar, SearchInput } from '@/components/ui/ListToolbar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { useSession } from '@/lib/auth/SessionProvider';
import { ageLabel } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { parsePageSize } from '@/lib/pagination';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useApprovals, useWaitingCounts } from '../hooks/useApprovals';
import { activeTab, approvalTabsFor, tabCaption } from '../lib/approvalTabs';
import { BulkDecisionDialog } from './BulkDecisionDialog';
import {
  STATUS_LABEL,
  STATUS_TONE,
  dateRangeError,
  dateRangeToInstants,
  requestDetail,
  requestTitle,
  selectableRows,
  stageLabel,
} from '../lib/approvals';

const ANY = 'all';
/** What "reviewed" holds: a request that is still open, or sent back to the employee, is not in it. */
const DECIDED_STATUSES: ApprovalStatus[] = ['APPROVED', 'REJECTED', 'WITHDRAWN'];
const STATUS_OPTIONS = [
  { value: ANY, label: 'Any status' },
  ...DECIDED_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
];

/** One of the two lists: a title with its count, then the table and its pager, with the same four states as every list. */
function ApprovalsPane({
  title,
  count,
  query,
  columns,
  emptyTitle,
  emptyDescription,
  pageSize,
  onPageChange,
  onPageSizeChange,
  toolbar,
}: {
  title: string;
  count: number | undefined;
  query: ReturnType<typeof useApprovals>;
  columns: readonly Column<ApprovalInboxItemDto>[];
  emptyTitle: string;
  emptyDescription: string;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  /** The row of controls under the title. Both panes reserve its height, so the two tables start level. */
  toolbar?: ReactNode;
}) {
  return (
    <section aria-label={title} className="min-w-0 py-4 first:pt-0 lg:px-5 lg:py-0 lg:first:pl-0 lg:last:pr-0">
      <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text">
          {title}
          {count === undefined ? null : <span className="ml-2 text-sm font-normal text-text-muted">{count}</span>}
        </h2>
      </div>
      <div className="mb-3 flex h-10 items-center gap-3 overflow-x-auto whitespace-nowrap">{toolbar}</div>
      <TopProgressBar active={query.isFetching && !query.isLoading} />
      <DataState
        isLoading={query.isLoading}
        error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
        isEmpty={query.data?.items.length === 0}
        empty={{ title: emptyTitle, description: emptyDescription }}
      >
        <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} bleed={false} />
        {query.data ? (
          <Pagination
            page={query.data.page}
            pageSize={pageSize}
            totalPages={query.data.totalPages}
            total={query.data.total}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            bleed={false}
          />
        ) : null}
      </DataState>
    </section>
  );
}

/** The request's own name (a doctor's) over its kind, place and sender; a link into the full review. */
const requestColumn = (): Column<ApprovalInboxItemDto> => ({
  key: 'request',
  header: 'Request',
  render: (r) => (
    <div>
      <Link href={`/approvals/${r.id}`} className="font-medium text-text hover:text-accent hover:underline">
        {requestTitle(r)}
      </Link>
      <div className="text-xs text-text-subtle">{requestDetail(r)}</div>
    </div>
  ),
});

const openColumn = (): Column<ApprovalInboxItemDto> => ({
  key: 'open',
  header: '',
  className: 'w-20 text-right',
  render: (r) => (
    <Link href={`/approvals/${r.id}`} className="text-sm text-accent hover:underline">
      {r.canAct ? 'Review' : 'View'}
    </Link>
  ),
});

export function ApprovalsScreen() {
  // The reviewed list pages on its own (`rpage`, `rsize`); the waiting one uses the usual `page` and `pageSize`.
  const { values, page, pageSize, update } = useFilterParams(['kind', 'status', 'from', 'to', 'search', 'rpage', 'rsize']);
  const role = useSession().user?.role;
  const readOnly = useIsReadOnly();
  const tabs = approvalTabsFor(role);
  // Only Admin and HR may read what has been decided (a manager sees what is waiting on them).
  const canSeeReviewed = role === 'ADMIN' || role === 'HR';
  const counts = useWaitingCounts(tabs, tabs.length > 0, values.search);
  const kind = activeTab(tabs, values.kind);
  const rangeError = dateRangeError(values.from, values.to);
  const reviewedPage = Math.max(1, Number(values.rpage) || 1);
  const reviewedSize = parsePageSize(values.rsize);

  const shared = {
    ...(kind && { kind }),
    ...(values.search && { search: values.search }),
    ...(rangeError ? {} : dateRangeToInstants(values.from, values.to)),
  };
  const waiting = useApprovals('waiting', { page, pageSize, ...shared }, !rangeError);
  const reviewed = useApprovals(
    'history',
    {
      page: reviewedPage,
      pageSize: reviewedSize,
      decided: true,
      ...shared,
      ...(values.status && { status: values.status as ApprovalStatus }),
    },
    !rangeError && canSeeReviewed,
  );

  // A filter change goes back to the first page of both lists.
  const change = (changes: Parameters<typeof update>[0]) => update({ rpage: '', ...changes });
  const [search, setSearch] = useSearchFilter(values.search, (v) => change({ search: v }));

  // Bulk selection: only what the caller can act on, and only on the page in front of them.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulk, setBulk] = useState<'APPROVE' | 'REJECT' | null>(null);
  const filterKey = `${kind}|${values.search}|${values.from}|${values.to}|${page}`;
  useEffect(() => setSelected(new Set()), [filterKey]);
  const selectable = selectableRows(waiting.data?.items ?? []);
  const chosen = selectable.filter((r) => selected.has(r.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const waitingColumns: readonly Column<ApprovalInboxItemDto>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (r) =>
        selectable.some((s) => s.id === r.id) ? (
          <input
            type="checkbox"
            checked={selected.has(r.id)}
            onChange={() => toggle(r.id)}
            disabled={readOnly}
            aria-label={`Select ${requestTitle(r)} from ${r.submitter?.name ?? 'an employee'}`}
            className="size-4 rounded border-border-strong accent-[var(--color-accent)]"
          />
        ) : null,
    },
    requestColumn(),
    {
      key: 'stage',
      header: 'Waiting on',
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={STATUS_TONE[r.status]}>{stageLabel(r)}</Badge>
          {r.overdue ? <Badge tone="danger">Overdue</Badge> : null}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (r) => (
        <div>
          <div>{formatDate(r.submittedAt)}</div>
          <div className="text-xs text-text-subtle">waiting {ageLabel(r.submittedAt)}</div>
        </div>
      ),
    },
    openColumn(),
  ];

  const reviewedColumns: readonly Column<ApprovalInboxItemDto>[] = [
    requestColumn(),
    {
      key: 'stage',
      header: 'Status',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      key: 'decided',
      header: 'Last action',
      render: (r) => (
        <div>
          <div>{r.lastAction.actor?.name ?? '—'}</div>
          <div className="text-xs text-text-subtle">{formatDate(r.lastAction.at)}</div>
        </div>
      ),
    },
    openColumn(),
  ];

  const filtered = values.from || values.to || values.status || values.search;

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          role === 'HR'
            ? 'Leave requests waiting for you to decide.'
            : 'Every request waiting on a decision, longest-waiting first.'
        }
        actions={
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-sm text-text-muted">
            <label htmlFor="approvals-from">Submitted from</label>
            <Input id="approvals-from" type="date" value={values.from} onChange={(e) => change({ from: e.target.value })} className="w-40" />
            <label htmlFor="approvals-to">to</label>
            <Input id="approvals-to" type="date" value={values.to} onChange={(e) => change({ to: e.target.value })} className="w-40" aria-invalid={rangeError ? true : undefined} />
          </div>
        }
      />
      <ListToolbar>
        {tabs.length > 0 ? (
          <div className="basis-full overflow-x-auto">
            <Tabs value={kind} onValueChange={(v) => change({ kind: v })}>
              <TabsList>
                {tabs.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>
                    {tabCaption(t.label, counts[t.value])}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
        <SearchInput value={search} onChange={setSearch} placeholder="Search by employee name or code" label="Search approvals by employee" />
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => {
              setSearch('');
              change({ status: '', from: '', to: '', search: '' });
            }}>
            Clear filters
          </Button>
        ) : null}
        {rangeError ? (
          <p role="alert" className="basis-full text-[13px] text-danger-fg">
            {rangeError}
          </p>
        ) : null}
      </ListToolbar>

      <div className={`mt-4 grid grid-cols-1 divide-y divide-border lg:divide-y-0 ${canSeeReviewed ? 'lg:grid-cols-2 lg:divide-x' : ''}`}>
        <ApprovalsPane
          title="Waiting on you"
          count={waiting.data?.total}
          query={waiting}
          columns={waitingColumns}
          emptyTitle="Nothing waiting"
          emptyDescription="Every request has been decided. New ones appear here as they are submitted."
          pageSize={pageSize}
          onPageChange={(p) => update({ page: p })}
          onPageSizeChange={(n) => update({ pageSize: n })}
          toolbar={
            selectable.length > 0 ? (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={readOnly}
                  onClick={() => setSelected(allChosen ? new Set() : new Set(selectable.map((r) => r.id)))}
                >
                  {allChosen ? 'Clear selection' : `Select all ${selectable.length}`}
                </Button>
                {chosen.length > 0 ? (
                  <>
                    <span className="text-sm text-text-muted" aria-live="polite">
                      {chosen.length} selected
                    </span>
                    <Button size="sm" disabled={readOnly} onClick={() => setBulk('APPROVE')}>
                      Approve selected
                    </Button>
                    <Button size="sm" variant="secondary" disabled={readOnly} onClick={() => setBulk('REJECT')}>
                      Reject selected
                    </Button>
                  </>
                ) : null}
              </>
            ) : null
          }
        />
        {canSeeReviewed ? (
          <ApprovalsPane
            title="Reviewed"
            count={reviewed.data?.total}
            toolbar={
              <div className="w-44">
                <Select
                  aria-label="Status"
                  value={values.status || ANY}
                  options={STATUS_OPTIONS}
                  onValueChange={(v) => change({ status: v === ANY ? '' : v })}
                />
              </div>
            }
            query={reviewed}
            columns={reviewedColumns}
            emptyTitle="Nothing reviewed"
            emptyDescription="No decided request matches these filters."
            pageSize={reviewedSize}
            onPageChange={(p) => update({ rpage: p })}
            onPageSizeChange={(n) => update({ rsize: n, rpage: '' })}
          />
        ) : null}
      </div>

      {bulk ? (
        <BulkDecisionDialog
          decision={bulk}
          rows={chosen}
          onClose={() => setBulk(null)}
          onFinished={(decided) => setSelected((prev) => new Set([...prev].filter((id) => !decided.includes(id))))}
        />
      ) : null}
    </>
  );
}
