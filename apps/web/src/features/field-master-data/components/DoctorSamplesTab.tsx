'use client';

import type { DoctorDto, SampleAllocationDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useAdjustSample, useDoctorSamples, useIssueSample } from '../hooks/useDoctors';
import { useActiveProducts } from '../hooks/useProducts';
import { adjustTotalError, givenOut, issuePreview, issueQuantityError } from '../lib/samples';
import { FormDialog } from '@/components/ui/FormDialog';

/** Samples issued for this doctor and what is left. Issuing adds; correcting sets the total. */
export function DoctorSamplesTab({ doctor }: { doctor: DoctorDto }) {
  const readOnly = useIsReadOnly();
  const samples = useDoctorSamples(doctor.id);
  const [adjusting, setAdjusting] = useState<SampleAllocationDto | null>(null);
  const canIssue = doctor.status === 'active' && !readOnly;

  const columns: readonly Column<SampleAllocationDto>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (a) => (
        <div>
          <div className="font-medium">{a.productName || '—'}</div>
          <div className="text-xs text-text-subtle tabular-nums">{a.productSku}</div>
        </div>
      ),
    },
    {
      key: 'allocated',
      header: 'Allocated',
      numeric: true,
      render: (a) => a.quantityAllocated.toLocaleString('en-IN'),
    },
    {
      key: 'given',
      header: 'Given out',
      numeric: true,
      render: (a) => givenOut(a).toLocaleString('en-IN'),
    },
    {
      key: 'remaining',
      header: 'Remaining',
      numeric: true,
      render: (a) => (
        <span className="font-medium">{a.quantityRemaining.toLocaleString('en-IN')}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (a) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={readOnly}
          onClick={() => setAdjusting(a)}
          aria-label={`Correct the allocation of ${a.productName}`}
        >
          Correct
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {canIssue ? (
        <IssueForm doctor={doctor} existing={samples.data ?? []} />
      ) : (
        <p className="rounded-lg border border-border bg-surface-subtle p-4 text-sm text-text-muted">
          {readOnly
            ? 'A past financial year is read-only.'
            : doctor.status === 'pending'
              ? 'Samples can be issued once this doctor is approved.'
              : 'Samples can only be issued for an active doctor.'}
        </p>
      )}
      <Card
        flat
        title="Allocated samples"
        description="What the assigned MR can still give this doctor, per product."
      >
        <DataState
          isLoading={samples.isLoading}
          error={samples.error ? toErrorState(samples.error, () => void samples.refetch()) : null}
          isEmpty={samples.data?.length === 0}
          empty={{
            title: 'No samples issued',
            description: 'Issue a product above to let the MR give it on a visit.',
          }}
        >
          <DataTable columns={columns} rows={samples.data ?? []} rowKey={(a) => a.id} />
        </DataState>
      </Card>
      {adjusting ? (
        <AdjustDialog
          doctorId={doctor.id}
          allocation={adjusting}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
    </div>
  );
}

function IssueForm({
  doctor,
  existing,
}: {
  doctor: DoctorDto;
  existing: readonly SampleAllocationDto[];
}) {
  const products = useActiveProducts();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const issue = useIssueSample(doctor.id, () => {
    setProductId('');
    setQuantity('');
  });
  const current = existing.find((a) => a.productId === productId);
  const quantityError = quantity === '' ? undefined : issueQuantityError(quantity);

  function submit() {
    const found: Record<string, string> = {};
    if (!productId) found['productId'] = 'Choose a product.';
    const problem = issueQuantityError(quantity);
    if (problem) found['quantity'] = problem;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    issue.mutate({ productId, quantity: Number(quantity.trim()) });
  }

  return (
    <Card title="Issue samples" description="Adds to what is already allocated for that product.">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-5 p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-start"
      >
        <FormField label="Product" htmlFor="sample-product" error={errors['productId']}>
          <Select
            id="sample-product"
            value={productId}
            onValueChange={setProductId}
            options={(products.data ?? []).map((p) => ({
              value: p.id,
              label: `${p.name} (${p.sku})`,
            }))}
            placeholder={products.isLoading ? 'Loading products…' : 'Choose a product'}
            aria-invalid={errors['productId'] ? true : undefined}
          />
        </FormField>
        <FormField
          label="Quantity"
          htmlFor="sample-quantity"
          error={errors['quantity'] ?? quantityError}
          {...(!errors['quantity'] && !quantityError && quantity !== '' && productId
            ? { hint: issuePreview(current, Number(quantity.trim())) }
            : {})}
        >
          <Input
            id="sample-quantity"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={errors['quantity'] || quantityError ? true : undefined}
          />
        </FormField>
        <div className="sm:pt-[1.625rem]">
          <Button type="submit" disabled={issue.isPending}>
            {issue.isPending ? 'Issuing…' : 'Issue'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Sets the allocated total. It cannot go below what has been given out, which the field side already drew down. */
function AdjustDialog({
  doctorId,
  allocation,
  onClose,
}: {
  doctorId: string;
  allocation: SampleAllocationDto;
  onClose: () => void;
}) {
  const [total, setTotal] = useState(String(allocation.quantityAllocated));
  const [error, setError] = useState<string | undefined>();
  const adjust = useAdjustSample(doctorId, onClose);
  const given = givenOut(allocation);

  function submit() {
    const problem = adjustTotalError(total, given);
    setError(problem);
    if (problem) return;
    const next = Number(total.trim());
    if (next === allocation.quantityAllocated) return onClose();
    adjust.mutate({ productId: allocation.productId, quantityAllocated: next });
  }

  return (
    <FormDialog
      title={`Correct ${allocation.productName}`}
      description={`Sets the allocated total. ${given.toLocaleString('en-IN')} have already been given out, so it cannot go lower.`}
      formId="adjust-sample-form"
      pending={adjust.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Allocated total" htmlFor="adjust-total" error={error}>
        <Input
          id="adjust-total"
          inputMode="numeric"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
