'use client';

import type { ApprovalInboxItemDto, ApprovalStatus } from '@greynote/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { Select } from '@/components/ui/Select';
import { useSession } from '@/lib/auth/SessionProvider';
import { ageLabel } from '@/lib/dates';
import { formatDate } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useApprovals, type ApprovalView } from '../hooks/useApprovals';
import {
  KIND_OPTIONS,
  STATUS_LABEL,
  STATUS_TONE,
  dateRangeError,
  dateRangeToInstants,
  kindLabel,
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
  // HR decides leave only; offering the other kinds would only ever show an empty list.
  const kindOptions = role === 'HR' ? KIND_OPTIONS.filter((k) => k.value === 'LEAVE') : KIND_OPTIONS;
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

  const columns: readonly Column<ApprovalInboxItemDto>[] = [
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
          <Badge tone={STATUS_TONE[r.status]}>{stageLabel(r)}</Badge>
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
          <div className="flex gap-1" role="group" aria-label="View">
            <Button variant={view === 'waiting' ? 'primary' : 'secondary'} aria-pressed={view === 'waiting'} onClick={() => update({ view: '', status: '' })}>
              Waiting on you
            </Button>
            <Button variant={view === 'history' ? 'primary' : 'secondary'} aria-pressed={view === 'history'} onClick={() => update({ view: 'history' })}>
              History
            </Button>
          </div>
          {role === 'HR' ? null : (
            <div className="w-44">
              <Select
                aria-label="Kind"
                value={values.kind || ANY}
                options={[{ value: ANY, label: 'All kinds' }, ...kindOptions]}
                onValueChange={(v) => update({ kind: v === ANY ? '' : v })}
              />
            </div>
          )}
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
    />
  );
}
