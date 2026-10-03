'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, FieldList } from '@/components/ui/FieldList';

// Re-exported so the people screens keep importing the description list from one place.
export { Field, FieldList };

/**
 * One independently-saved section: a read view with an Edit button that swaps to a form. The form
 * is mounted only while editing, so its draft is fresh from the latest data every time.
 */
export function SectionCard({
  title,
  description,
  readOnly,
  view,
  renderForm,
}: {
  title: string;
  description?: string;
  /** No Edit button at all (past financial year). */
  readOnly: boolean;
  view: ReactNode;
  renderForm: (close: () => void) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <Card
      title={title}
      {...(description ? { description } : {})}
      actions={
        editing ? null : (
          <Button
            variant="secondary"
            size="sm"
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        )
      }
    >
      <div className="p-5">{editing ? renderForm(() => setEditing(false)) : view}</div>
    </Card>
  );
}

/** The form body of a section: the fields, then Cancel and Save. */
export function SectionForm({
  pending,
  onCancel,
  onSubmit,
  children,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
