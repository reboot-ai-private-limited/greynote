'use client';

import { GST_RATES, PRODUCT_TYPES, PRODUCT_TYPE_LABEL, type ProductDto } from '@greynote/contracts';
import { useId, useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateProduct, useProductCategories, useUpdateProduct } from '../hooks/useProducts';
import { EMPTY_PRODUCT, buildProduct, buildProductUpdate, productToDraft, type ProductDraft } from '../lib/products';

const TYPE_OPTIONS = PRODUCT_TYPES.map((t) => ({ value: t, label: PRODUCT_TYPE_LABEL[t] }));
const GST_OPTIONS = GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }));

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
      <FormField label="Brand" htmlFor="product-name" error={errors['name']} hint="The product's brand name, e.g. XYZ-500.">
        <Input id="product-name" value={draft.name} onChange={(e) => set('name')(e.target.value)} aria-invalid={invalid('name')} />
      </FormField>
      <FormField label="SKU" htmlFor="product-sku" error={errors['sku']} hint="Unique. Capital letters and spaces do not make a different SKU.">
        <Input id="product-sku" value={draft.sku} onChange={(e) => set('sku')(e.target.value)} aria-invalid={invalid('sku')} />
      </FormField>
      <FormField label="Composition" htmlFor="product-composition" error={errors['composition']} hint="e.g. Paracetamol 500mg">
        <Input id="product-composition" value={draft.composition} onChange={(e) => set('composition')(e.target.value)} aria-invalid={invalid('composition')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Type" htmlFor="product-type" error={errors['type']}>
          <Select id="product-type" value={draft.type} onValueChange={set('type')} options={TYPE_OPTIONS} placeholder="Choose a type" aria-invalid={invalid('type')} />
        </FormField>
        <FormField label="Pack size" htmlFor="product-pack" error={errors['packSize']} hint="e.g. 10×10">
          <Input id="product-pack" value={draft.packSize} onChange={(e) => set('packSize')(e.target.value)} aria-invalid={invalid('packSize')} />
        </FormField>
      </div>
      <FormField label="Therapeutic class" htmlFor="product-category" error={errors['category']} hint="e.g. Analgesic/Antipyretic">
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
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="PTS (₹)" htmlFor="product-pts" error={errors['pts']} hint="Price to stockist">
          <Input id="product-pts" inputMode="decimal" value={draft.pts} onChange={(e) => set('pts')(e.target.value)} aria-invalid={invalid('pts')} />
        </FormField>
        <FormField label="PTR (₹)" htmlFor="product-ptr" error={errors['ptr']} hint="Price to retailer">
          <Input id="product-ptr" inputMode="decimal" value={draft.ptr} onChange={(e) => set('ptr')(e.target.value)} aria-invalid={invalid('ptr')} />
        </FormField>
        <FormField label="MRP (₹)" htmlFor="product-mrp" error={errors['mrp']}>
          <Input id="product-mrp" inputMode="decimal" value={draft.mrp} onChange={(e) => set('mrp')(e.target.value)} aria-invalid={invalid('mrp')} />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="GST" htmlFor="product-gst" error={errors['gst']}>
          <Select id="product-gst" value={draft.gst} onValueChange={set('gst')} options={GST_OPTIONS} placeholder="Choose GST" aria-invalid={invalid('gst')} />
        </FormField>
        <FormField label="HSN/SAC" htmlFor="product-hsn" error={errors['hsn']} hint="4 to 8 digits, on the Tax Invoice">
          <Input id="product-hsn" inputMode="numeric" value={draft.hsn} onChange={(e) => set('hsn')(e.target.value)} aria-invalid={invalid('hsn')} />
        </FormField>
        <FormField label="Division" htmlFor="product-division" error={errors['division']} hint="Optional, e.g. General.">
          <Input id="product-division" value={draft.division} onChange={(e) => set('division')(e.target.value)} aria-invalid={invalid('division')} />
        </FormField>
      </div>
    </FormDialog>
  );
}
