'use client';

import type { CompanyDocumentDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { toErrorState } from '@/lib/api/toErrorState';
import { formatDateTime } from '@/lib/format';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useDocuments, useRemoveDocument } from '../hooks/useDocuments';
import { CATEGORY_LABEL, sizeLabel } from '../lib/documents';
import { DocumentFormDialog } from './DocumentFormDialog';

/** The document library (Admin): files employees see in the Docs tab of the phone app. */
export function DocumentsScreen() {
  const readOnly = useIsReadOnly();
  const list = useDocuments();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CompanyDocumentDto | null>(null);
  const remove = useRemoveDocument(() => setRemoving(null));
  const rows = list.data ?? [];

  const columns: readonly Column<CompanyDocumentDto>[] = [
    {
      key: 'title',
      header: 'Document',
      render: (d) => (
        <div>
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium hover:text-accent hover:underline"
          >
            {d.title}
          </a>
          <p className="text-xs text-text-subtle">
            {d.fileKind.toUpperCase()} · {sizeLabel(d.sizeBytes)}
          </p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (d) => CATEGORY_LABEL[d.category] },
    {
      key: 'for',
      header: 'For',
      render: (d) =>
        d.everyone ? (
          <Badge tone="success">Everyone</Badge>
        ) : (
          <Badge tone="neutral">{`${d.userIds?.length ?? 0} ${d.userIds?.length === 1 ? 'person' : 'people'}`}</Badge>
        ),
    },
    { key: 'added', header: 'Added', render: (d) => formatDateTime(d.uploadedAt) },
    {
      key: 'actions',
      header: '',
      className: 'w-24 text-right',
      render: (d) => (
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => setRemoving(d)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Documents"
        description="Files for the Docs tab of the phone app: policies, circulars, forms. Share with every field employee or with chosen people. Payslips appear there on their own once payroll is finalized."
        actions={
          <Button disabled={readOnly} onClick={() => setAdding(true)}>
            Add document
          </Button>
        }
      />
      <DataState
        isLoading={list.isLoading}
        error={list.error ? toErrorState(list.error, () => void list.refetch()) : null}
        isEmpty={rows.length === 0}
        empty={{ title: 'No documents yet', description: 'Add one to share it with employees.' }}
      >
        <DataTable columns={columns} rows={rows} rowKey={(d) => d.id} />
      </DataState>
      {adding ? <DocumentFormDialog onClose={() => setAdding(false)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove this document?"
        description={
          removing
            ? `“${removing.title}” disappears from the phone app and the file is deleted. This can't be undone.`
            : undefined
        }
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </>
  );
}
