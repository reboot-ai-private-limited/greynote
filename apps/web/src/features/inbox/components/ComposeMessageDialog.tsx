'use client';

import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Choices } from '@/features/hr/components/HolidayFormDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { usePublishMessage } from '../hooks/useInbox';
import {
  BODY_MAX,
  EMPTY_MESSAGE,
  KIND_OPTIONS,
  ROLE_OPTIONS,
  TITLE_MAX,
  buildMessage,
  toggle,
  type MessageDraft,
} from '../lib/inbox';
import { toast } from '@/components/ui/toast';
import type { InboxKind } from '@greynote/contracts';

/** Send a message to an audience. It reaches the people who match now; later joiners do not get it. Mounted only while open. */
export function ComposeMessageDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<MessageDraft>(EMPTY_MESSAGE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const directory = useTerritoryDirectory();
  const publish = usePublishMessage(onClose);
  const set = <K extends keyof MessageDraft>(key: K, value: MessageDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function submit() {
    const built = buildMessage(draft);
    if (!built.ok) return setErrors(built.errors);
    setErrors({});
    publish.mutate(built.body, {
      onSuccess: (r) =>
        toast.success(
          `Sent to ${r.recipientCount} ${r.recipientCount === 1 ? 'person' : 'people'}.`,
        ),
    });
  }

  return (
    <FormDialog
      title="New message"
      description="It goes to the people who match the audience right now, and shows in their app's inbox."
      formId="inbox-form"
      pending={publish.isPending}
      onClose={onClose}
      onSubmit={submit}
      wide
    >
      <FormField label="Title" htmlFor="inbox-title" error={errors['title']}>
        <Input
          id="inbox-title"
          maxLength={TITLE_MAX}
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          aria-invalid={errors['title'] ? true : undefined}
        />
      </FormField>
      <FormField
        label="Message"
        htmlFor="inbox-body"
        error={errors['body']}
        hint={`${draft.body.length} / ${BODY_MAX}`}
      >
        <Textarea
          id="inbox-body"
          rows={5}
          value={draft.body}
          onChange={(e) => set('body', e.target.value)}
          aria-invalid={errors['body'] ? true : undefined}
        />
      </FormField>
      <FormField label="Kind" htmlFor="inbox-kind">
        <Select
          id="inbox-kind"
          value={draft.kind}
          options={KIND_OPTIONS}
          onValueChange={(v) => set('kind', v as InboxKind)}
        />
      </FormField>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Who gets it</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.everyone}
            onChange={(e) => set('everyone', e.target.checked)}
            className="size-4 rounded border-border-strong accent-[var(--color-accent)]"
          />
          Everyone
        </label>
        {draft.everyone ? null : (
          <div className="space-y-4">
            <Choices
              legend="Roles"
              options={ROLE_OPTIONS}
              chosen={draft.roles}
              onToggle={(r) =>
                set('roles', toggle(draft.roles, r as MessageDraft['roles'][number]))
              }
            />
            <Choices
              legend="Zones (field employees there)"
              options={directory.zoneOptions}
              chosen={draft.zoneIds}
              onToggle={(id) => set('zoneIds', toggle(draft.zoneIds, id))}
            />
            <Choices
              legend="HQs (field employees there)"
              options={directory.hqOptions}
              chosen={draft.hqIds}
              onToggle={(id) => set('hqIds', toggle(draft.hqIds, id))}
            />
            <p className="text-[13px] text-text-subtle">
              Anyone who matches any one choice gets the message once.
            </p>
          </div>
        )}
        {errors['audience'] ? (
          <p role="alert" className="text-[13px] text-danger-fg">
            {errors['audience']}
          </p>
        ) : null}
      </fieldset>

      <FormField
        label="Disappears at"
        htmlFor="inbox-expires"
        error={errors['expiresAt']}
        hint="Optional. After this the message leaves everyone's inbox."
      >
        <Input
          id="inbox-expires"
          type="datetime-local"
          value={draft.expiresAt}
          onChange={(e) => set('expiresAt', e.target.value)}
          aria-invalid={errors['expiresAt'] ? true : undefined}
        />
      </FormField>
    </FormDialog>
  );
}
