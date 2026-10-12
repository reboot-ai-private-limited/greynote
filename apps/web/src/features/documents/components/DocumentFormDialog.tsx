'use client';

import { COMPANY_DOCUMENT_CATEGORIES, type CompanyDocumentCategory } from '@greynote/contracts';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Choices } from '@/features/hr/components/HolidayFormDialog';
import { useFieldEmployees } from '@/features/territory/hooks/useFieldEmployees';
import { useUploadDocument } from '../hooks/useDocuments';
import {
  CATEGORY_LABEL,
  DOCUMENT_ACCEPT,
  EMPTY_DOCUMENT,
  buildDocumentForm,
  documentErrors,
  type DocumentDraft,
} from '../lib/documents';

const CATEGORY_OPTIONS = COMPANY_DOCUMENT_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABEL[c],
}));

/** Add a document for every field employee, or for the people ticked. Mounted only while open. */
export function DocumentFormDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<DocumentDraft>(EMPTY_DOCUMENT);
  const [file, setFile] = useState<File | null>(null);
  const [everyone, setEveryone] = useState(true);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const upload = useUploadDocument(onClose);
  const people = useFieldEmployees(search, !everyone);
  const invalid = (field: string) => (errors[field] ? true : undefined);

  function submit() {
    const found = documentErrors(draft, file);
    if (!everyone && draft.userIds.length === 0)
      found['userIds'] = 'Pick at least one person, or switch to everyone.';
    setErrors(found);
    if (Object.keys(found).length > 0 || !file) return;
    upload.mutate(buildDocumentForm({ ...draft, userIds: everyone ? [] : draft.userIds }, file));
  }

  return (
    <FormDialog
      title="Add a document"
      description="Shows in the Docs tab of the phone app, next to the employee's payslips."
      formId="document-form"
      pending={upload.isPending}
      onClose={onClose}
      onSubmit={submit}
    >
      <FormField label="Title" htmlFor="doc-title" error={errors['title']}>
        <Input
          id="doc-title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          aria-invalid={invalid('title')}
        />
      </FormField>
      <FormField label="Category" htmlFor="doc-category" error={errors['category']}>
        <Select
          id="doc-category"
          value={draft.category}
          onValueChange={(v) => setDraft((d) => ({ ...d, category: v as CompanyDocumentCategory }))}
          options={CATEGORY_OPTIONS}
          aria-invalid={invalid('category')}
        />
      </FormField>
      <FormField
        label="File"
        htmlFor="doc-file"
        error={errors['file']}
        hint="A PDF, JPG or PNG, up to 10 MB."
      >
        <input
          id="doc-file"
          type="file"
          accept={DOCUMENT_ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          aria-invalid={invalid('file')}
          className="block w-full text-sm text-text file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-text hover:file:bg-surface-hover"
        />
      </FormField>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={everyone}
          onChange={(e) => setEveryone(e.target.checked)}
          className="size-4 rounded border-border-strong accent-[var(--color-accent)]"
        />
        Every field employee
      </label>
      {everyone ? null : (
        <>
          <Input
            aria-label="Search employees"
            placeholder="Search by name or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Choices
            legend="People"
            options={[
              ...(people.data?.items ?? []).map((u) => ({
                value: u.id,
                label: `${u.name} (${u.employeeCode})`,
              })),
            ].concat(
              draft.userIds
                .filter((id) => !people.data?.items.some((u) => u.id === id))
                .map((id) => ({ value: id, label: 'Chosen earlier' })),
            )}
            chosen={draft.userIds}
            onToggle={(id) =>
              setDraft((d) => ({
                ...d,
                userIds: d.userIds.includes(id)
                  ? d.userIds.filter((x) => x !== id)
                  : [...d.userIds, id],
              }))
            }
            error={errors['userIds']}
          />
        </>
      )}
    </FormDialog>
  );
}
