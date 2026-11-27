'use client';

import type { SentInboxMessageDto } from '@greynote/contracts';
import { Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { formatDateTime } from '@/lib/format';
import { useRecipientsOf } from '../hooks/useInbox';
import { INBOX_KIND_LABEL, describeAudience } from '../lib/inbox';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/**
 * One inbox message in full: the whole text (the list shows two lines), the files, who got it, how many opened it and when it was sent.
 * `onTakeBack` closes this and asks the list to confirm taking the message back (or clearing a notification).
 */
export function MessageDetailsDialog({
  message,
  onClose,
  onTakeBack,
  onDelete,
}: {
  message: SentInboxMessageDto;
  onClose: () => void;
  onTakeBack: (message: SentInboxMessageDto) => void;
  /** Only for a taken-back mail (2026-11-27). */
  onDelete: (message: SentInboxMessageDto) => void;
}) {
  const automatic = message.source === 'SYSTEM';
  // Who it reached and who opened it (2026-11-27); a taken-back mail's copies are gone.
  const recipients = useRecipientsOf(message.id, !automatic && !message.retractedAt);
  const opened = (recipients.data ?? []).filter((r) => r.readAt !== null);
  const notOpened = (recipients.data ?? []).filter((r) => r.readAt === null);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={message.title}
      description={automatic ? 'Automatic notification' : 'Message sent from the portal'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {message.retractedAt ? (
            automatic ? null : (
              <Button variant="danger" onClick={() => onDelete(message)}>
                Delete
              </Button>
            )
          ) : (
            <Button variant="danger" onClick={() => onTakeBack(message)}>
              {automatic ? 'Clear' : 'Take back'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <p className="whitespace-pre-wrap break-words text-sm text-text">{message.body}</p>
        <dl className="space-y-2 border-t border-border pt-4">
          <Field label="Kind">
            <Badge tone="neutral">{INBOX_KIND_LABEL[message.kind]}</Badge>
          </Field>
          <Field label="Sent to">{describeAudience(message.audience) || '—'}</Field>
          <Field label="Opened">
            {message.retractedAt ? <Badge tone="neutral">Taken back {formatDateTime(message.retractedAt)}</Badge> : `${message.readCount} of ${message.recipientCount}`}
          </Field>
          <Field label="Sent">{formatDateTime(message.sentAt)}</Field>
          {message.expiresAt ? <Field label="Shown until">{formatDateTime(message.expiresAt)}</Field> : null}
          {message.attachments.length > 0 ? (
            <Field label="Files">
              <ul className="space-y-1">
                {message.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-1.5">
                    <Paperclip aria-hidden className="size-3.5 shrink-0 text-text-subtle" />
                    <a href={a.url} target="_blank" rel="noreferrer" className="truncate underline-offset-2 hover:underline">
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}
        </dl>
        {!automatic && !message.retractedAt ? (
          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <PeopleList title={`Not opened yet (${notOpened.length})`} loading={recipients.isLoading} people={notOpened.map((r) => ({ key: r.userId, name: r.name, code: r.employeeCode, note: null }))} />
            <PeopleList title={`Opened (${opened.length})`} loading={recipients.isLoading} people={opened.map((r) => ({ key: r.userId, name: r.name, code: r.employeeCode, note: r.readAt ? formatDateTime(r.readAt) : null }))} />
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function PeopleList({ title, loading, people }: { title: string; loading: boolean; people: Array<{ key: string; name: string; code: string; note: string | null }> }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1.5 text-sm font-semibold text-text">{title}</h3>
      {loading ? (
        <p className="text-sm text-text-subtle">Loading…</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-text-subtle">Nobody.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
          {people.map((p) => (
            <li key={p.key} className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                {p.name} <span className="text-xs text-text-subtle">{p.code}</span>
              </span>
              {p.note ? <span className="shrink-0 text-xs text-text-muted">{p.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
