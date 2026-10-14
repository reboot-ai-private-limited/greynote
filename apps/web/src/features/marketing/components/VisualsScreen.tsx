'use client';

import { VISUAL_CATEGORY_LABEL, type VisualDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader } from '@/components/ui/PageHeader';
import { RowActions } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { toErrorState } from '@/lib/api/toErrorState';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useUpdateVisual, useVisuals } from '../hooks/useVisuals';
import { visualKind } from '../lib/visuals';
import { VisualFormDialog } from './VisualFormDialog';
import { VisualPreviewDialog } from './VisualPreviewDialog';
import { VisualThumb } from './VisualThumb';

const ANY = 'all';
const GENERAL = 'general';

/** The visual library (Admin): upload, correct, and switch off what MRs can show doctors. */
export function VisualsScreen() {
  const readOnly = useIsReadOnly();
  const [status, setStatus] = useState('');
  const [productFilter, setProductFilter] = useState(ANY);
  const [form, setForm] = useState<{ visual?: VisualDto } | null>(null);
  const [preview, setPreview] = useState<VisualDto | null>(null);
  const [toggling, setToggling] = useState<VisualDto | null>(null);
  const update = useUpdateVisual(() => setToggling(null));
  const products = useActiveProducts();
  const visuals = useVisuals({
    ...(status && { status: status as 'active' | 'inactive' }),
    ...(productFilter !== ANY && productFilter !== GENERAL && { productId: productFilter }),
  });
  const productName = (id: string | null) =>
    id ? (products.data?.find((p) => p.id === id)?.name ?? 'Inactive product') : 'General';
  // "General" has no API filter (a missing product id means any), so it is narrowed here.
  const rows = (visuals.data ?? []).filter(
    (v) => productFilter !== GENERAL || v.productId === null,
  );

  const columns: readonly Column<VisualDto>[] = [
    {
      key: 'title',
      header: 'Visual',
      render: (v) => (
        <div className="flex items-center gap-3">
          <VisualThumb visual={v} onOpen={() => setPreview(v)} />
          <div>
            <button
              type="button"
              onClick={() => setPreview(v)}
              className="text-left font-medium hover:text-accent hover:underline"
            >
              {v.title}
            </button>
            <p className="text-xs text-text-subtle">{visualKind(v.mimeType)}</p>
          </div>
        </div>
      ),
    },
    { key: 'product', header: 'Product', render: (v) => productName(v.productId) },
    { key: 'category', header: 'Category', render: (v) => VISUAL_CATEGORY_LABEL[v.category] },
    {
      key: 'status',
      header: 'Status',
      render: (v) => (
        <Badge tone={v.status === 'active' ? 'success' : 'neutral'}>
          {v.status === 'active' ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (v) => (
        <RowActions
          label={v.title}
          status={v.status}
          disabled={readOnly}
          onEdit={() => setForm({ visual: v })}
          onToggleStatus={() => setToggling(v)}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Visuals"
        description="What MRs can show doctors: product visuals, plus general branding and campaign content. A deactivated visual disappears from the MR's list."
        actions={
          <Button disabled={readOnly} onClick={() => setForm({})}>
            Upload visual
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            aria-label="Product"
            value={productFilter}
            onValueChange={setProductFilter}
            options={[
              { value: ANY, label: 'All products' },
              { value: GENERAL, label: 'General only' },
              ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
        <StatusFilter value={status} onChange={setStatus} />
      </div>
      <DataState
        isLoading={visuals.isLoading}
        error={visuals.error ? toErrorState(visuals.error, () => void visuals.refetch()) : null}
        isEmpty={rows.length === 0}
        empty={{ title: 'No visuals', description: 'Upload one, or change the filters.' }}
      >
        <DataTable columns={columns} rows={rows} rowKey={(v) => v.id} />
      </DataState>
      <VisualPreviewDialog visual={preview} onClose={() => setPreview(null)} />
      {form ? <VisualFormDialog visual={form.visual} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling ? { id: toggling.id, name: toggling.title, status: toggling.status } : null}
        noun="visual"
        pending={update.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(next) => toggling && update.mutate({ id: toggling.id, body: { status: next } })}
      />
    </>
  );
}
