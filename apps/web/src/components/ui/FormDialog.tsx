'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

/**
 * The frame every dialog form shares. The Save button sits in the dialog footer, outside
 * the <form>, so it is tied to the form by id.
 */
export function FormDialog({
  title,
  description,
  formId,
  pending,
  disabled = false,
  onClose,
  onSubmit,
  wide,
  children,
}: {
  title: string;
  description?: string;
  formId: string;
  pending: boolean;
  /** Keeps Save off without saying "Saving…" (the form is not ready yet). */
  disabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={title}
      {...(wide ? { wide } : {})}
      {...(description ? { description } : {})}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || disabled}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          // A dialog opened from inside another form must not submit that one too (React events bubble through portals).
          event.stopPropagation();
          onSubmit();
        }}
      >
        {children}
      </form>
    </Dialog>
  );
}
