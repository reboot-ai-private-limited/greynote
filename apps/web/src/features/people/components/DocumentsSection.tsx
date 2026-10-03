'use client';

import type { UserDetailDto, UserDocumentDto } from '@greynote/contracts';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { formatDate } from '@/lib/format';
import { useRemoveDocument, useUploadDocument } from '../hooks/useUsers';
import {
  ACCEPT_ATTRIBUTE,
  DOCUMENT_TYPES,
  buildDocumentForm,
  documentErrors,
  documentTypeLabel,
} from '../lib/documents';

/** Uploaded identity and qualification documents. Uploading and removing save immediately; there is no draft. */
export function DocumentsSection({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const documents = user.profile?.documents ?? [];
  const [removing, setRemoving] = useState<UserDocumentDto | null>(null);
  const remove = useRemoveDocument(user.id, () => setRemoving(null));

  return (
    <div className="space-y-6">
      {readOnly ? null : <UploadForm userId={user.id} />}
      <Card title="Documents" description="Open in a new tab. Removing one deletes the file from storage.">
        {documents.length === 0 ? (
          <EmptyState title="No documents" description="Upload an Aadhaar, PAN or any other document for this employee." />
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-text hover:text-accent hover:underline"
                  >
                    {documentTypeLabel(d.type)}
                  </a>
                  <p className="text-xs text-text-subtle">Uploaded {formatDate(d.uploadedAt)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={readOnly}
                  title={readOnly ? 'A past financial year is read-only' : undefined}
                  aria-label={`Remove ${documentTypeLabel(d.type)}`}
                  onClick={() => setRemoving(d)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove document"
        {...(removing
          ? { description: `“${documentTypeLabel(removing.type)}” is deleted from storage and from this employee. This cannot be undone.` }
          : {})}
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

function UploadForm({ userId }: { userId: string }) {
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadDocument(userId, () => {
    setDocumentType('');
    setFile(null);
    if (input.current) input.current.value = '';
  });

  function submit() {
    const found = documentErrors({ documentType, file });
    setErrors(found);
    if (Object.keys(found).length > 0 || !file) return;
    upload.mutate(buildDocumentForm(documentType, file));
  }

  return (
    <Card title="Upload a document" description="PDF, JPG or PNG, up to 10 MB.">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid gap-5 p-5 sm:grid-cols-[14rem_1fr_auto] sm:items-start"
      >
        <FormField label="Type" htmlFor="doc-type" error={errors['documentType']}>
          <Select
            id="doc-type"
            value={documentType}
            onValueChange={setDocumentType}
            options={DOCUMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            placeholder="Choose a type"
            aria-invalid={errors['documentType'] ? true : undefined}
          />
        </FormField>
        <FormField label="File" htmlFor="doc-file" error={errors['file']}>
          <input
            id="doc-file"
            ref={input}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            aria-invalid={errors['file'] ? true : undefined}
            className="block w-full text-sm text-text file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-text hover:file:bg-surface-hover"
          />
        </FormField>
        <div className="sm:pt-[1.625rem]">
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
