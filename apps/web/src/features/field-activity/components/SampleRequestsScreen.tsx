'use client';

import type { SampleRequestDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { TopProgressBar } from '@/components/ui/TopProgressBar';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDate } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useMarkSampleRequestDone, useSampleRequests } from '../hooks/useSampleRequests';

const ANY = 'all';
const STATUS_OPTIONS = [
  { value: 'REQUESTED', label: 'Waiting' },
  { value: 'DONE', label: 'Done' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: ANY, label: 'All' },
];
const KIND_OPTIONS = [
  { value: ANY, label: 'Samples and LBL' },
  { value: 'SAMPLE', label: 'Samples' },
  { value: 'LBL', label: 'LBL' },
];
const STATUS_TONE = { REQUESTED: 'warning', DONE: 'success', CANCELLED: 'neutral' } as const;
const STATUS_LABEL = { REQUESTED: 'Waiting', DONE: 'Done', CANCELLED: 'Cancelled' } as const;

/** Marks one request done: the employee is credited each product's quantity, which can be lowered or raised here first. */
function DoneDialog({ request, onClose }: { request: SampleRequestDto; onClose: () => void }) {
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(request.lines.map((l) => [l.productId, String(l.quantity)])));
  const [error, setError] = useState<string | null>(null);
  const done = useMarkSampleRequestDone(onClose);

  function submit() {
    const credits = request.lines.map((l) => ({ productId: l.productId, quantity: Number(qty[l.productId]) }));
    if (credits.some((c) => !Number.isInteger(c.quantity) || c.quantity < 0)) return setError('Enter a whole number, 0 or more, for every product.');
    setError(null);
    done.mutate({ id: request.id, body: { credits } });
  }

  return (
    <FormDialog
      title={`Mark ${request.kind === 'SAMPLE' ? 'sample' : 'LBL'} request done`}
      description={`${request.userName} is credited these quantities. Change one if you are giving a different amount.`}
      formId="sample-done-form"
      pending={done.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      {request.lines.map((l) => (
        <FormField key={l.productId} label={`${l.productName} (asked ${l.quantity})`} htmlFor={`credit-${l.productId}`}>
          <Input id={`credit-${l.productId}`} inputMode="numeric" value={qty[l.productId] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [l.productId]: e.target.value }))} />
        </FormField>
      ))}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </FormDialog>
  );
}

/** Sample and LBL requests from employees. Admin, Accounts and HR mark each done, which credits the employee; managers read it on the person's page. */
export function SampleRequestsScreen() {
  const { values, update } = useFilterParams(['status', 'kind']);
  const status = values.status === ANY ? undefined : values.status === 'DONE' || values.status === 'CANCELLED' ? values.status : 'REQUESTED';
  const kind = values.kind === 'SAMPLE' || values.kind === 'LBL' ? values.kind : undefined;
  const [marking, setMarking] = useState<SampleRequestDto | null>(null);
  const query = useSampleRequests({ ...(status && { status }), ...(kind && { kind }) });
  const rows = query.data ?? [];

  const columns: readonly Column<SampleRequestDto>[] = [
    { key: 'employee', header: 'Employee', render: (r) => <span className="font-medium">{r.userName || 'Unknown'}</span> },
    { key: 'kind', header: 'Type', render: (r) => (r.kind === 'SAMPLE' ? 'Sample' : 'LBL') },
    {
      key: 'products',
      header: 'Products',
      render: (r) => r.lines.map((l) => `${l.productName} × ${l.creditedQuantity ?? l.quantity}${l.creditedQuantity !== null && l.creditedQuantity !== l.quantity ? ` (asked ${l.quantity})` : ''}`).join(', '),
    },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks ?? '—' },
    { key: 'requested', header: 'Requested', render: (r) => formatDate(r.requestedAt) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
    {
      key: 'action',
      header: '',
      render: (r) => (r.status === 'REQUESTED' ? <Button onClick={() => setMarking(r)}>Mark done</Button> : r.doneAt ? <span className="text-sm text-muted">{formatDate(r.doneAt)}</span> : null),
    },
  ];

  return (
    <>
      <PageHeader title="Sample & LBL" description="Requests from employees. Mark one done to credit the employee; they then give it to doctors from the app." />
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="w-48">
          <Select aria-label="Status" value={status ?? ANY} options={STATUS_OPTIONS} onValueChange={(v) => update({ status: v })} />
        </div>
        <div className="w-56">
          <Select aria-label="Type" value={kind ?? ANY} options={KIND_OPTIONS} onValueChange={(v) => update({ kind: v === ANY ? '' : v })} />
        </div>
      </div>
      <Card flat>
        <TopProgressBar active={query.isFetching && !query.isLoading} />
        <DataState
          isLoading={query.isLoading}
          error={query.error ? toErrorState(query.error, () => void query.refetch()) : null}
          isEmpty={rows.length === 0}
          empty={{ title: 'No requests', description: status === 'REQUESTED' ? 'Nothing is waiting.' : 'No request matches.' }}
        >
          <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
        </DataState>
      </Card>
      {marking ? <DoneDialog request={marking} onClose={() => setMarking(null)} /> : null}
    </>
  );
}
