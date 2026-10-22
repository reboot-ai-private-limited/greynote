'use client';

import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Choices } from '@/features/hr/components/HolidayFormDialog';
import { useTerritoryDirectory } from '@/features/territory/hooks/useTerritoryDirectory';
import { sizeLabel } from '@/lib/format';
import { useMessageRecipients, usePublishMessage } from '../hooks/useInbox';
import {
  ATTACHMENT_ACCEPT,
  EMPTY_MESSAGE,
  KIND_OPTIONS,
  ROLE_OPTIONS,
  TITLE_MAX,
  attachmentError,
  buildMessage,
  toggle,
  togglePerson,
  type MessageDraft,
} from '../lib/inbox';
import { toast } from '@/components/ui/toast';
import type { InboxKind } from '@greynote/contracts';

/**
 * Send a message to an audience, with files if wanted. It reaches the people who match now; later joiners do not get
 * it. Mounted only while open.
 */
export function ComposeMessageDialog({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState<MessageDraft>(EMPTY_MESSAGE);
  const [files, setFiles] = useState<File[]>([]);
  const [search, setSearch] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const picker = useRef<HTMLInputElement>(null);
  const directory = useTerritoryDirectory();
  const people = useMessageRecipients(search, !draft.everyone);
  const publish = usePublishMessage(onClose);
  const set = <K extends keyof MessageDraft>(key: K, value: MessageDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const added = [...list].filter(
      (f) => !files.some((x) => x.name === f.name && x.size === f.size),
    );
    setFiles((fs) => [...fs, ...added]);
    setErrors(({ files: _dropped, ...rest }) => rest);
  }

  function submit() {
    const built = buildMessage(draft);
    const fileProblem = attachmentError(files);
    if (!built.ok || fileProblem) {
      return setErrors({
        ...(built.ok ? {} : built.errors),
        ...(fileProblem && { files: fileProblem }),
      });
    }
    setErrors({});
    publish.mutate(
      { body: built.body, files },
      {
        onSuccess: (r) =>
          toast.success(
            `Sent to ${r.recipientCount} ${r.recipientCount === 1 ? 'person' : 'people'}.`,
          ),
      },
    );
  }

  const found = people.data?.items ?? [];

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
      <FormField label="Message" htmlFor="inbox-body" error={errors['body']}>
        <Textarea
          id="inbox-body"
          rows={8}
          value={draft.body}
          onChange={(e) => set('body', e.target.value)}
          aria-invalid={errors['body'] ? true : undefined}
        />
      </FormField>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Attachments</legend>
        {files.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {files.map((f) => (
              <li
                key={`${f.name}-${f.size}`}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">
                  {f.name} <span className="text-text-subtle">· {sizeLabel(f.size)}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles((fs) => fs.filter((x) => x !== f))}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={picker}
          type="file"
          multiple
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button variant="secondary" size="sm" onClick={() => picker.current?.click()}>
          <Paperclip aria-hidden className="size-4" /> Attach files
        </Button>
        {errors['files'] ? (
          <p role="alert" className="text-[13px] text-danger-fg">
            {errors['files']}
          </p>
        ) : (
          <p className="text-[13px] text-text-subtle">
            Optional. Up to 5 files, 10 MB each: PDF, JPG, PNG, WebP, Word, Excel or PowerPoint.
            People can open or download them from the app.
          </p>
        )}
      </fieldset>

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
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-text">People</p>
              {draft.people.length > 0 ? (
                <ul className="flex flex-wrap gap-1.5" aria-label="Chosen people">
                  {draft.people.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-1 rounded-full border border-border bg-surface-hover py-0.5 pl-2.5 pr-1 text-[13px]"
                    >
                      {p.label}
                      <button
                        type="button"
                        aria-label={`Remove ${p.label}`}
                        onClick={() => set('people', togglePerson(draft.people, p))}
                        className="rounded-full p-0.5 text-text-subtle hover:text-text"
                      >
                        <X aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Input
                aria-label="Search employees"
                placeholder="Search any employee by name or code"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Choices
                legend="Matching employees"
                options={found.map((u) => ({ value: u.id, label: `${u.name} (${u.employeeCode})` }))}
                chosen={draft.people.map((p) => p.id)}
                onToggle={(id) => {
                  const u = found.find((x) => x.id === id);
                  if (u)
                    set('people', togglePerson(draft.people, { id, label: `${u.name} (${u.employeeCode})` }));
                }}
              />
            </div>
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
