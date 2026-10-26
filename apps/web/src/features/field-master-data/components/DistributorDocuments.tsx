'use client';

import type { DistributorDocumentDto, DistributorDocumentType } from '@greynote/contracts';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilePreviewDialog } from '@/components/ui/FilePreviewDialog';
import { FileThumb } from '@/components/ui/FileThumb';
import { FormField } from '@/components/ui/FormField';
import { Select } from '@/components/ui/Select';
import { ACCEPT_ATTRIBUTE, buildDocumentForm, fileKindOfUrl } from '@/features/people/lib/documents';
import { formatDate } from '@/lib/format';
import { useRemoveDistributorDocument, useUploadDistributorDocument } from '../hooks/useDistributors';
import { DISTRIBUTOR_DOCUMENT_LABEL, DISTRIBUTOR_DOCUMENT_OPTIONS, distributorDocumentErrors, type PendingDocument } from '../lib/distributors';

/** A document type and a file; "Attach" hands both to the parent, which decides whether to upload now or keep them for later. */
function AttachForm({ onAttach, pending = false, label = 'Attach' }: { onAttach: (type: DistributorDocumentType, file: File) => void; pending?: boolean; label?: string }) {
  const [type, setType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

  function submit() {
    const found = distributorDocumentErrors({ type, file });
    setErrors(found);
    if (Object.keys(found).length > 0 || !file) return;
    onAttach(type as DistributorDocumentType, file);
    setType('');
    setFile(null);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[14rem_1fr_auto] sm:items-start">
      <FormField label="Type" htmlFor="dist-doc-type" error={errors['documentType']}>
        <Select id="dist-doc-type" value={type} onValueChange={setType} options={DISTRIBUTOR_DOCUMENT_OPTIONS} placeholder="Choose a type" aria-invalid={errors['documentType'] ? true : undefined} />
      </FormField>
      <FormField label="File" htmlFor="dist-doc-file" error={errors['file']} hint="PDF, JPG or PNG, up to 10 MB.">
        <input
          id="dist-doc-file"
          ref={input}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          aria-invalid={errors['file'] ? true : undefined}
          className="block w-full text-sm text-text file:mr-3 file:h-10 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-4 file:text-sm file:font-medium file:text-text hover:file:bg-surface-hover"
        />
      </FormField>
      <div className="sm:pt-[1.625rem]">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? 'Uploading…' : label}
        </Button>
      </div>
    </div>
  );
}

/** The wizard's step: files are kept in the draft and uploaded once the distributor is created. Optional, and several of one type are fine. */
export function PendingDocumentsField({ value, onChange }: { value: PendingDocument[]; onChange: (next: PendingDocument[]) => void }) {
  return (
    <div className="space-y-5">
      <AttachForm label="Add to list" onAttach={(type, file) => onChange([...value, { key: `${Date.now()}-${value.length}`, type, file }])} />
      {value.length === 0 ? (
        <p className="text-[13px] text-text-subtle">No documents chosen. You can skip this and add them later from the distributor’s page.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {value.map((d) => (
            <li key={d.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">{DISTRIBUTOR_DOCUMENT_LABEL[d.type]}</p>
                <p className="truncate text-xs text-text-subtle">{d.file.name}</p>
              </div>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${d.file.name}`} onClick={() => onChange(value.filter((x) => x.key !== d.key))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The distributor's page: attaching and removing save at once, as on an employee. */
export function DistributorDocumentsCard({ distributorId, documents, locked }: { distributorId: string; documents: DistributorDocumentDto[]; locked: boolean }) {
  const [preview, setPreview] = useState<DistributorDocumentDto | null>(null);
  const [removing, setRemoving] = useState<DistributorDocumentDto | null>(null);
  const upload = useUploadDistributorDocument(distributorId, () => undefined);
  const remove = useRemoveDistributorDocument(distributorId, () => setRemoving(null));

  return (
    <Card title="Documents" description="Drug licence, GST certificate, agreement and the like. Removing one deletes the file from storage.">
      <div className="space-y-5 p-5">
        {locked ? null : <AttachForm label="Upload" pending={upload.isPending} onAttach={(type, file) => upload.mutate(buildDocumentForm(type, file))} />}
        {documents.length === 0 ? (
          <EmptyState title="No documents" description="Attach the licence, GST certificate or agreement for this distributor." />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <FileThumb title={DISTRIBUTOR_DOCUMENT_LABEL[d.type]} url={d.url} kind={fileKindOfUrl(d.url)} onOpen={() => setPreview(d)} />
                  <div className="min-w-0">
                    <button type="button" onClick={() => setPreview(d)} className="text-left font-medium text-text hover:text-accent hover:underline">
                      {DISTRIBUTOR_DOCUMENT_LABEL[d.type]}
                    </button>
                    <p className="text-xs text-text-subtle">Uploaded {formatDate(d.uploadedAt)}</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`Remove ${DISTRIBUTOR_DOCUMENT_LABEL[d.type]}`} onClick={() => setRemoving(d)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <FilePreviewDialog file={preview ? { title: DISTRIBUTOR_DOCUMENT_LABEL[preview.type], url: preview.url, kind: fileKindOfUrl(preview.url) } : null} onClose={() => setPreview(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Remove document"
        {...(removing ? { description: `“${DISTRIBUTOR_DOCUMENT_LABEL[removing.type]}” is deleted from storage and from this distributor. This cannot be undone.` } : {})}
        confirmLabel="Remove"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}
