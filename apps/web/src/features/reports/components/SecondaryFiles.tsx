'use client';

import type { SecondaryAttachmentDto } from '@greynote/contracts';
import { Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FilePreviewDialog, type PreviewFile } from '@/components/ui/FilePreviewDialog';
import { FileThumb, type FileKind } from '@/components/ui/FileThumb';
import { toast } from '@/components/ui/toast';
import { useAddSecondaryFile, useRemoveSecondaryFile } from '../hooks/useEmployeeSales';

const ACCEPT = 'image/jpeg,image/png,application/pdf';
const MAX_BYTES = 5 * 1024 * 1024;

const kindOf = (mime: string): FileKind => (mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'other');

/**
 * The files attached to one employee's secondary for a month, as proof of the figures: photos or PDFs, any number. Everyone who can see the month
 * sees them; `canEdit` adds the picker and the remove buttons (the server decides again, so a locked month still refuses).
 */
export function SecondaryFiles({
  files,
  userId,
  month,
  canEdit,
  isSelf,
}: {
  files: readonly SecondaryAttachmentDto[];
  userId: string;
  month: string;
  canEdit: boolean;
  /** The signed-in employee's own month: the server takes `userId` from the sign-in, so it is left out of the upload. */
  isSelf: boolean;
}) {
  const add = useAddSecondaryFile();
  const remove = useRemoveSecondaryFile();
  const picker = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const file of picked) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 5 MB.`);
        continue;
      }
      const form = new FormData();
      form.append('month', month);
      if (!isSelf) form.append('userId', userId);
      form.append('file', file);
      try {
        await add.mutateAsync(form);
        done++;
      } catch {
        // The mutation has already shown the server's reason; carry on with the rest.
      }
    }
    setBusy(false);
    if (picker.current) picker.current.value = '';
    if (done > 0) toast.success(done === 1 ? 'File attached.' : `${done} files attached.`);
  }

  return (
    <section aria-label="Files" className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text">
          Files <span className="font-normal text-text-subtle">· photos or PDFs of the figures, any number</span>
        </p>
        {canEdit ? (
          <>
            <input ref={picker} type="file" accept={ACCEPT} multiple className="sr-only" aria-label="Choose files to attach" onChange={(e) => void upload(e.target.files)} />
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => picker.current?.click()}>
              <Paperclip aria-hidden className="mr-1 size-4" />
              {busy ? 'Uploading…' : 'Add files'}
            </Button>
          </>
        ) : null}
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-text-muted">No files attached.</p>
      ) : (
        <ul className="flex flex-wrap gap-3">
          {files.map((f) => (
            <li key={f.id} className="flex w-24 flex-col items-center gap-1">
              <FileThumb title={f.fileName} url={f.url} kind={kindOf(f.mimeType)} className="size-20" onOpen={() => setPreview({ title: f.fileName, url: f.url, kind: kindOf(f.mimeType) })} />
              <span className="w-full truncate text-center text-xs text-text-muted" title={f.fileName}>
                {f.fileName}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  aria-label={`Remove ${f.fileName}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(f.id)}
                  className="rounded-md p-1 text-text-subtle hover:bg-surface-hover hover:text-danger focus-visible:shadow-focus focus-visible:outline-none disabled:opacity-50"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <FilePreviewDialog file={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
