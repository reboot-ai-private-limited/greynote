'use client';

import type { ProductDto } from '@greynote/contracts';
import { useId, useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { useCreateProduct, useProductCategories, useUpdateProduct } from '../hooks/useProducts';
import { EMPTY_PRODUCT, buildProduct, buildProductUpdate, productToDraft, type ProductDraft } from '../lib/products';

/** Create (no `product`) or edit (`product`). Mounted only while open, so its draft is fresh each time. */
export function ProductFormDialog({ product, onClose }: { product?: ProductDto | undefined; onClose: () => void }) {
  const [draft, setDraft] = useState<ProductDraft>(product ? productToDraft(product) : EMPTY_PRODUCT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateProduct(onClose);
  const update = useUpdateProduct(onClose);
  const { categories } = useProductCategories();
  const listId = useId();
  const set = (field: keyof ProductDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    if (product) {
      const built = buildProductUpdate(product, draft);
      if (!built.ok) return setErrors(built.errors);
      if (Object.keys(built.body).length === 0) return onClose();
      return update.mutate({ id: product.id, body: built.body });
    }
    const built = buildProduct(draft);
    if (!built.ok) return setErrors(built.errors);
    create.mutate(built.body);
  }

  return (
    <FormDialog
      title={product ? 'Edit product' : 'New product'}
      description="One catalog for what can be ordered and what can be given as a sample."
      formId="product-form"
      pending={create.isPending || update.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Name" htmlFor="product-name" error={errors['name']}>
        <Input id="product-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
      </FormField>
      <FormField label="SKU" htmlFor="product-sku" error={errors['sku']} hint="Unique. Capital letters and spaces do not make a different SKU.">
        <Input id="product-sku" value={draft.sku} onChange={(e) => set('sku')(e.target.value)} aria-invalid={invalid('sku')} />
      </FormField>
      <FormField label="Category" htmlFor="product-category" error={errors['category']}>
        <Input
          id="product-category"
          list={listId}
          value={draft.category}
          onChange={(e) => set('category')(e.target.value)}
          aria-invalid={invalid('category')}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </FormField>
    </FormDialog>
  );
}
