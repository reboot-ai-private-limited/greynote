'use client';

import {
  VISUAL_CATEGORIES,
  VISUAL_CATEGORY_LABEL,
  type VisualCategory,
  type VisualDto,
} from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useActiveProducts } from '@/features/field-master-data/hooks/useProducts';
import { useReplaceVisualFile, useUpdateVisual, useUploadVisual } from '../hooks/useVisuals';
import {
  EMPTY_VISUAL,
  VISUAL_ACCEPT_ATTRIBUTE,
  buildVisualForm,
  visualErrors,
  type VisualDraft,
} from '../lib/visuals';

const GENERAL = 'general';
const CATEGORY_OPTIONS = VISUAL_CATEGORIES.map((c) => ({
  value: c,
  label: VISUAL_CATEGORY_LABEL[c],
}));

/** Upload (no `visual`) or edit (`visual`): an edit can also put a new image on it, and the old file is removed from storage. */
export function VisualFormDialog({
  visual,
  onClose,
}: {
  visual?: VisualDto | undefined;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<VisualDraft>(
    visual
      ? {
          title: visual.title,
          category: visual.category,
          productId: visual.productId ?? '',
          file: null,
        }
      : EMPTY_VISUAL,
  );
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const upload = useUploadVisual(onClose);
  const update = useUpdateVisual(onClose);
  const replace = useReplaceVisualFile();
  const products = useActiveProducts();
  const productOptions = [
    { value: GENERAL, label: 'General (no product)' },
    ...(products.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];
  const invalid = (field: string) => (errors[field] ? true : undefined);

  async function submit() {
    const found = visualErrors({ ...draft, file }, !visual);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (visual) {
      // A new image goes up first; if that fails nothing else is saved and the old image stays.
      if (file) {
        try {
          await replace.mutateAsync({ id: visual.id, file });
        } catch {
          return;
        }
      }
      update.mutate({
        id: visual.id,
        body: {
          title: draft.title.trim(),
          category: draft.category as VisualCategory,
          productId: draft.productId || null,
        },
      });
    } else if (file) {
      upload.mutate(buildVisualForm(draft, file));
    }
  }

  return (
    <FormDialog
      title={visual ? 'Edit visual' : 'Upload a visual'}
      description="MRs pick visuals from this library to show each doctor. Product visuals group under their product."
      formId="visual-form"
      pending={upload.isPending || update.isPending || replace.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Title" htmlFor="visual-title" error={errors['title']}>
        <Input
          id="visual-title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          aria-invalid={invalid('title')}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Category" htmlFor="visual-category" error={errors['category']}>
          <Select
            id="visual-category"
            value={draft.category}
            onValueChange={(v) => setDraft((d) => ({ ...d, category: v as VisualCategory }))}
            options={CATEGORY_OPTIONS}
            aria-invalid={invalid('category')}
          />
        </FormField>
        <FormField
          label="Product"
          htmlFor="visual-product"
          hint="Leave general for branding or campaign content."
        >
          <Select
            id="visual-product"
            value={draft.productId || GENERAL}
            onValueChange={(v) => setDraft((d) => ({ ...d, productId: v === GENERAL ? '' : v }))}
            options={productOptions}
          />
        </FormField>
      </div>
      <FormField
        label={visual ? 'Replace the image (optional)' : 'File'}
        htmlFor="visual-file"
        error={errors['file']}
        hint={
          visual
            ? 'Choose a new image to put on this visual. The old one is removed for good; doctors’ lists keep the visual and show the new image.'
            : 'An image (PNG, JPG, WebP or GIF), up to 25 MB.'
        }
      >
        <input
          id="visual-file"
          type="file"
          accept={VISUAL_ACCEPT_ATTRIBUTE}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          aria-invalid={invalid('file')}
          className="block w-full text-sm text-text file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-text hover:file:bg-surface-hover"
        />
      </FormField>
    </FormDialog>
  );
}
