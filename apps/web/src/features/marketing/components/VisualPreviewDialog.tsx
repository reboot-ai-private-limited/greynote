'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { ExternalLink, X } from 'lucide-react';
import type { VisualDto } from '@greynote/contracts';

/** A near-fullscreen view of one visual. Esc or the close button dismisses it. */
export function VisualPreviewDialog({
  visual,
  onClose,
}: {
  visual: Pick<VisualDto, 'title' | 'fileUrl' | 'mimeType'> | null;
  onClose: () => void;
}) {
  return (
    <RadixDialog.Root open={visual !== null} onOpenChange={(open) => !open && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/80" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 flex h-[92dvh] w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-pop focus:outline-none"
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3">
            <RadixDialog.Title className="truncate text-base font-semibold text-text">
              {visual?.title}
            </RadixDialog.Title>
            <div className="flex shrink-0 items-center gap-3">
              {visual ? (
                <a
                  href={visual.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-accent"
                >
                  <ExternalLink aria-hidden className="size-4" />
                  Open in new tab
                </a>
              ) : null}
              <RadixDialog.Close
                aria-label="Close"
                className="rounded-md p-1 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
              >
                <X aria-hidden className="size-5" />
              </RadixDialog.Close>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-neutral-900/5 p-4">
            {visual?.mimeType.startsWith('image/') ? (
              <img
                src={visual.fileUrl}
                alt={visual.title}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <p className="text-sm text-text-muted">
                This file can’t be previewed here. Use “Open in new tab”.
              </p>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
