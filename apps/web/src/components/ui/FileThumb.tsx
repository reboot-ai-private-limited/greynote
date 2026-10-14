'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/components/ui/cn';

export type FileKind = 'image' | 'pdf' | 'other';

/** A small clickable thumbnail of a file; an icon tile for a PDF, another kind, or an image that will not load. */
export function FileThumb({
  title,
  url,
  kind,
  onOpen,
  className,
}: {
  title: string;
  url: string;
  kind: FileKind;
  onOpen: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${title}`}
      className={cn(
        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-hover text-text-subtle hover:border-border-strong focus-visible:shadow-focus focus-visible:outline-none',
        className,
      )}
    >
      {kind === 'image' && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <FileText aria-hidden className="size-5" />
      )}
    </button>
  );
}
