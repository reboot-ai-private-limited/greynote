'use client';

import type { ApprovalInboxItemDto, ApprovalStatus } from '@greynote/contracts';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { Select } from '@/components/ui/Select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useSession } from '@/lib/auth/SessionProvider';
import { ageLabel } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useApprovals, useWaitingCounts, type ApprovalView } from '../hooks/useApprovals';
import { approvalTabsFor, tabCaption } from '../lib/approvalTabs';
import { BulkDecisionDialog } from './BulkDecisionDialog';
import {
  STATUS_LABEL,
  STATUS_TONE,
  dateRangeError,
  dateRangeToInstants,
  kindLabel,
  selectableRows,
  stageLabel,
} from '../lib/approvals';

const ANY = 'all';
const STATUS_OPTIONS = [
  { value: ANY, label: 'Any status' },
  ...(Object.entries(STATUS_LABEL) as [ApprovalStatus, string][]).map(([value, label]) => ({ value, label })),
];

export function ApprovalsScreen() {
  const { values, page, update } = useFilterParams(['view', 'kind', 'status', 'from', 'to']);
  const role = useSession().user?.role;
  const readOnly = useIsReadOnly();
  const view: ApprovalView = values.view === 'history' ? 'history' : 'waiting';
  const tabs = approvalTabsFor(role);
  const counts = useWaitingCounts(tabs, tabs.length > 0 && view === 'waiting');
  const rangeError = dateRangeError(values.from, values.to);

  const list = useApprovals(
    view,
    {
      page,
      ...(values.kind && { kind: values.kind }),
      ...(view === 'history' && values.status && { status: values.status as ApprovalStatus }),
      ...(rangeError ? {} : dateRangeToInstants(values.from, values.to)),
    },
    !rangeError,
  );

  // Bulk selection: only what the caller can act on, and only on the page in front of them.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulk, setBulk] = useState<'APPROVE' | 'REJECT' | null>(null);
  const filterKey = `${view}|${values.kind}|${values.status}|${values.from}|${values.to}|${page}`;
  useEffect(() => setSelected(new Set()), [filterKey]);
  const selectable = view === 'waiting' ? selectableRows(list.data?.items ?? []) : [];
  const chosen = selectable.filter((r) => selected.has(r.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: readonly Column<ApprovalInboxItemDto>[] = [
    ...(view === 'waiting'
      ? [
          {
            key: 'select',
            header: '',
            className: 'w-10',
            render: (r: ApprovalInboxItemDto) =>
              selectable.some((s) => s.id === r.id) ? (
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                  disabled={readOnly}
                  aria-label={`Select ${kindLabel(r.kind)} from ${r.submitter?.name ?? 'an employee'}`}
                  className="size-4 rounded border-border-strong accent-[var(--color-accent)]"
                />
              ) : null,
          },
        ]
      : []),
    {
      key: 'request',
      header: 'Request',
      render: (r) => (
        <div>
          <Link href={`/approvals/${r.id}`} className="font-medium text-text hover:text-accent hover:underline">
            {kindLabel(r.kind)}
          </Link>
          <div className="text-xs text-text-subtle">
            {r.submitter ? `${r.submitter.name} · ${r.submitter.employeeCode}` : 'Unknown employee'}
            {r.cycle > 1 ? ` · resubmitted (round ${r.cycle})` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'stage',
      header: view === 'waiting' ? 'Waiting on' : 'Status',
      render: (r) =>
        view === 'waiting' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONE[r.status]}>{stageLabel(r)}</Badge>
            {r.overdue ? <Badge tone="danger">Overdue</Badge> : null}
          </div>
        ) : (
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
        ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      render: (r) => (
        <div>
          <div>{formatDate(r.submittedAt)}</div>
          {view === 'waiting' ? <div className="text-xs text-text-subtle">waiting {ageLabel(r.submittedAt)}</div> : null}
        </div>
      ),
    },
    ...(view === 'history'
      ? [
          {
            key: 'decided',
            header: 'Last action',
            render: (r: ApprovalInboxItemDto) => (
              <div>
                <div>{r.lastAction.actor?.name ?? '—'}</div>
                <div className="text-xs text-text-subtle">{formatDate(r.lastAction.at)}</div>
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'open',
      header: '',
      className: 'w-24 text-right',
      render: (r) => (
        <Link href={`/approvals/${r.id}`} className="text-sm text-accent hover:underline">
          {r.canAct ? 'Review' : 'View'}
        </Link>
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Approvals"
      description={
        role === 'HR'
          ? 'Leave requests waiting for you to decide.'
          : 'Every request waiting on a decision, longest-waiting first. Approving one that is still with the manager skips the manager.'
      }
      noun="request"
      readOnly={readOnly}
      filters={
        <>
          {tabs.length > 0 ? (
            <div className="basis-full overflow-x-auto">
              <Tabs value={values.kind || ANY} onValueChange={(v) => update({ kind: v === ANY ? '' : v })}>
                <TabsList>
                  {tabs.map((t) => (
                    <TabsTrigger key={t.value || ANY} value={t.value || ANY}>
                      {tabCaption(t.label, view === 'waiting' ? counts[t.value] : undefined)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
          <div className="flex gap-1" role="group" aria-label="View">
            <Button variant={view === 'waiting' ? 'primary' : 'secondary'} aria-pressed={view === 'waiting'} onClick={() => update({ view: '', status: '' })}>
              Waiting on you
            </Button>
            <Button variant={view === 'history' ? 'primary' : 'secondary'} aria-pressed={view === 'history'} onClick={() => update({ view: 'history' })}>
              History
            </Button>
          </div>
          {view === 'history' ? (
            <div className="w-44">
              <Select
                aria-label="Status"
                value={values.status || ANY}
                options={STATUS_OPTIONS}
                onValueChange={(v) => update({ status: v === ANY ? '' : v })}
              />
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <label htmlFor="approvals-from">Submitted from</label>
            <Input id="approvals-from" type="date" value={values.from} onChange={(e) => update({ from: e.target.value })} className="w-40" />
          </div>
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <label htmlFor="approvals-to">to</label>
            <Input id="approvals-to" type="date" value={values.to} onChange={(e) => update({ to: e.target.value })} className="w-40" aria-invalid={rangeError ? true : undefined} />
          </div>
          {values.from || values.to || values.kind || values.status ? (
            <Button variant="ghost" size="sm" onClick={() => update({ kind: '', status: '', from: '', to: '' })}>
              Clear filters
            </Button>
          ) : null}
          {view === 'waiting' && selectable.length > 0 ? (
            <div className="flex basis-full flex-wrap items-center gap-3 border-t border-border pt-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={readOnly}
                onClick={() => setSelected(allChosen ? new Set() : new Set(selectable.map((r) => r.id)))}
              >
                {allChosen ? 'Clear selection' : `Select all ${selectable.length} on this page`}
              </Button>
              <span className="text-sm text-text-muted" aria-live="polite">
                {chosen.length === 0 ? 'Select requests to decide them together.' : `${chosen.length} selected`}
              </span>
              {chosen.length > 0 ? (
                <>
                  <Button size="sm" disabled={readOnly} onClick={() => setBulk('APPROVE')}>
                    Approve selected
                  </Button>
                  <Button size="sm" variant="secondary" disabled={readOnly} onClick={() => setBulk('REJECT')}>
                    Reject selected
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
          {rangeError ? (
            <p role="alert" className="basis-full text-[13px] text-danger-fg">
              {rangeError}
            </p>
          ) : null}
        </>
      }
      query={list}
      columns={columns}
      emptyTitle={view === 'waiting' ? 'Nothing waiting' : 'No requests'}
      emptyDescription={view === 'waiting' ? 'Every request has been decided. New ones appear here as they are submitted.' : 'No request matches these filters.'}
      onPageChange={(p) => update({ page: p })}
    >
      {bulk ? (
        <BulkDecisionDialog
          decision={bulk}
          rows={chosen}
          onClose={() => setBulk(null)}
          onFinished={(decided) => setSelected((prev) => new Set([...prev].filter((id) => !decided.includes(id))))}
        />
      ) : null}
    </PagedListFrame>
  );
}
