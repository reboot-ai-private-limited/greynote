'use client';

import { FileText } from 'lucide-react';
import { useState } from 'react';
import type { VisualDto } from '@greynote/contracts';
import { cn } from '@/components/ui/cn';

/** A small clickable thumbnail of the visual; an icon tile for a file that is not an image or will not load. */
export function VisualThumb({
  visual,
  onOpen,
  className,
}: {
  visual: Pick<VisualDto, 'title' | 'fileUrl' | 'mimeType'>;
  onOpen: () => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = visual.mimeType.startsWith('image/') && !failed;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View ${visual.title}`}
      className={cn(
        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-hover text-text-subtle hover:border-border-strong focus-visible:shadow-focus focus-visible:outline-none',
        className,
      )}
    >
      {showImage ? (
        <img
          src={visual.fileUrl}
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
