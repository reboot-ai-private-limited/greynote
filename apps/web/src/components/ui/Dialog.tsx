'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

/**
 * A modal. Focus is trapped and returned by Radix; `footer` holds the actions. It never grows past the
 * viewport: the header and footer stay put and only the body scrolls, so Save is always reachable.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <RadixDialog.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-neutral-900/40" />
        <RadixDialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-pop focus:outline-none">
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
            <div>
              <RadixDialog.Title className="text-lg font-semibold text-text">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-text-muted">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close
              aria-label="Close"
              className="rounded-md p-1 text-text-subtle hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none"
            >
              <X aria-hidden className="size-4" />
            </RadixDialog.Close>
          </div>
          {children ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
          ) : null}
          {footer ? (
            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
