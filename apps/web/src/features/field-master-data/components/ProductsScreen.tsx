'use client';

import type { MasterStatus, ProductDto } from '@greynote/contracts';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import type { Column } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { RowActions } from '@/components/ui/RowActions';
import { Select } from '@/components/ui/Select';
import { StatusFilter } from '@/components/ui/StatusFilter';
import { StatusToggleDialog } from '@/components/ui/StatusToggleDialog';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useSearchFilter } from '@/lib/hooks/useSearchFilter';
import { useIsReadOnly } from '@/lib/useFinancialYear';
import { useProductCategories, useProducts, useUpdateProduct } from '../hooks/useProducts';
import { ProductFormDialog } from './ProductFormDialog';

const ANY = 'all';

export function ProductsScreen() {
  const { values, page, update } = useFilterParams(['search', 'status', 'category']);
  const [search, setSearch] = useSearchFilter(values.search, (v) => update({ search: v }));
  const readOnly = useIsReadOnly();
  const [form, setForm] = useState<{ product?: ProductDto } | null>(null);
  const [toggling, setToggling] = useState<ProductDto | null>(null);
  const updateProduct = useUpdateProduct(() => setToggling(null));
  const { categories } = useProductCategories();

  const products = useProducts({
    page,
    ...(values.search && { search: values.search }),
    ...(values.status && { status: values.status as MasterStatus }),
    ...(values.category && { category: values.category }),
  });

  const columns: readonly Column<ProductDto>[] = [
    { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'sku', header: 'SKU', render: (p) => <span className="tabular-nums">{p.sku}</span> },
    { key: 'category', header: 'Category', render: (p) => p.category },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>{p.status === 'active' ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      render: (p) => (
        <RowActions
          label={p.name}
          status={p.status}
          disabled={readOnly}
          onEdit={() => setForm({ product: p })}
          onToggleStatus={() => setToggling(p)}
        />
      ),
    },
  ];

  return (
    <PagedListFrame
      title="Products"
      description="The catalog for orders and samples. A deactivated product stays in history but can't be ordered or issued."
      noun="product"
      readOnly={readOnly}
      onNew={() => setForm({})}
      filters={
        <>
          <Input placeholder="Search by name or SKU" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
          <div className="w-48">
            <Select
              aria-label="Category"
              value={values.category || ANY}
              onValueChange={(v) => update({ category: v === ANY ? '' : v })}
              options={[{ value: ANY, label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <StatusFilter value={values.status} onChange={(v) => update({ status: v })} />
        </>
      }
      query={products}
      columns={columns}
      emptyDescription="No product matches these filters."
      onPageChange={(p) => update({ page: p })}
    >
      {form ? <ProductFormDialog product={form.product} onClose={() => setForm(null)} /> : null}
      <StatusToggleDialog
        item={toggling}
        noun="product"
        pending={updateProduct.isPending}
        onClose={() => setToggling(null)}
        onConfirm={(status) => toggling && updateProduct.mutate({ id: toggling.id, body: { status } })}
      />
    </PagedListFrame>
  );
}
