'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Avatar } from './Avatar';
import { PHOTO_ACCEPT, photoError } from '../lib/photo';

interface Props {
  name: string;
  /** The saved photo's address, if any. */
  photoUrl: string | null;
  /** A file chosen but not uploaded yet (the draft does not exist until the first Next); shown instead of the saved one. */
  pendingFile?: File | null;
  busy?: boolean;
  disabled?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

/**
 * Choose, replace or remove the employee's photo. "Remove" and "Choose another" are the same two buttons whether the
 * photo is saved or still waiting to be uploaded; the parent decides what each does.
 */
export function PhotoPicker({ name, photoUrl, pendingFile, busy, disabled, onPick, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const shown = preview ?? photoUrl;

  function chosen(file: File | undefined) {
    if (input.current) input.current.value = ''; // so the same file can be chosen again
    if (!file) return;
    const problem = photoError(file);
    setError(problem ?? null);
    if (!problem) onPick(file);
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} url={shown} className="size-20 text-xl" />
      <div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()}>
            {shown ? 'Choose another' : 'Add photo'}
          </Button>
          {shown ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={onRemove}>
              Remove photo
            </Button>
          ) : null}
        </div>
        <input ref={input} type="file" accept={PHOTO_ACCEPT} className="hidden" aria-label="Employee photo" onChange={(e) => chosen(e.target.files?.[0])} />
        <p className="mt-1 text-xs text-text-muted">{busy ? 'Saving…' : 'Optional. JPG, PNG or WebP, up to 5 MB.'}</p>
        {error ? <p role="alert" className="mt-1 text-xs text-danger-fg">{error}</p> : null}
      </div>
    </div>
  );
}
