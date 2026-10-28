'use client';

import type { InboxSource, SentInboxMessageDto } from '@greynote/contracts';
import { Paperclip } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Column } from '@/components/ui/DataTable';
import { PagedListFrame } from '@/components/ui/PagedListFrame';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { formatDateTime } from '@/lib/format';
import { useFilterParams } from '@/lib/hooks/useFilterParams';
import { useClearNotifications, useRetractMessage, useSentMessages } from '../hooks/useInbox';
import { INBOX_KIND_LABEL, describeAudience } from '../lib/inbox';
import { ComposeMessageDialog } from './ComposeMessageDialog';

/** Admin: send a message to the phone app's inbox, see how many have opened it, and take one back. */
export function InboxScreen() {
  const { values, page, pageSize, update } = useFilterParams(['source']);
  // Mail by default: automatic notifications ("sent a new doctor", "approved") pile up and are cleared on their own tab.
  const tab = values.source === 'SYSTEM' || values.source === 'ALL' ? values.source : 'ADMIN';
  const list = useSentMessages({ page, pageSize, ...(tab !== 'ALL' && { source: tab as InboxSource }) });
  const [composing, setComposing] = useState(false);
  const [retracting, setRetracting] = useState<SentInboxMessageDto | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const retract = useRetractMessage(() => setRetracting(null));
  const clearAll = useClearNotifications(() => setClearingAll(false));
  const isNotification = (m: SentInboxMessageDto) => m.source === 'SYSTEM';

  const columns: readonly Column<SentInboxMessageDto>[] = [
    {
      key: 'message',
      header: 'Message',
      render: (m) => (
        <div className="max-w-md">
          <div className="font-medium">{m.title}</div>
          <div className="line-clamp-2 text-xs text-text-muted">{m.body}</div>
          {m.attachments.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-subtle">
              <Paperclip aria-hidden className="size-3.5" />
              {m.attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                  {a.name}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'kind',
      header: 'Kind',
      render: (m) => <Badge tone="neutral">{INBOX_KIND_LABEL[m.kind]}</Badge>,
    },
    {
      key: 'audience',
      header: 'Sent to',
      render: (m) => <span className="text-text-muted">{describeAudience(m.audience)}</span>,
    },
    {
      key: 'reach',
      header: 'Opened',
      render: (m) =>
        m.retractedAt ? (
          <span className="text-text-subtle">—</span>
        ) : (
          `${m.readCount} of ${m.recipientCount}`
        ),
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (m) => (
        <div>
          <div>{formatDateTime(m.sentAt)}</div>
          {m.expiresAt ? (
            <div className="text-xs text-text-subtle">Until {formatDateTime(m.expiresAt)}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-28 text-right',
      render: (m) =>
        m.retractedAt ? (
          <Badge tone="neutral">Taken back</Badge>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setRetracting(m)}>
            {isNotification(m) ? 'Clear' : 'Take back'}
          </Button>
        ),
    },
  ];

  return (
    <PagedListFrame
      title="Inbox messages"
      description="Messages that show in the phone app's Inbox, with files if you attach them. Pick everyone, or any mix of named people, roles, zones and HQs; each person gets one copy."
      noun="message"
      readOnly={false}
      onNew={() => setComposing(true)}
      actions={
        tab !== 'ADMIN' ? (
          <Button variant="secondary" onClick={() => setClearingAll(true)}>
            Clear all notifications
          </Button>
        ) : null
      }
      filters={
        <Tabs value={tab} onValueChange={(v) => update({ source: v === 'ADMIN' ? '' : v, page: '' })}>
          <TabsList>
            <TabsTrigger value="ADMIN">Mail</TabsTrigger>
            <TabsTrigger value="SYSTEM">Notifications</TabsTrigger>
            <TabsTrigger value="ALL">All</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      query={list}
      columns={columns}
      emptyTitle={tab === 'SYSTEM' ? 'No notifications' : 'No messages yet'}
      emptyDescription={tab === 'SYSTEM' ? 'No automatic notifications right now.' : 'Nothing has been sent to the inbox.'}
      onPageChange={(p) => update({ page: p })}
      pageSize={pageSize}
      onPageSizeChange={(n) => update({ pageSize: n })}
    >
      {composing ? <ComposeMessageDialog onClose={() => setComposing(false)} /> : null}
      <ConfirmDialog
        open={retracting !== null}
        onOpenChange={(open) => !open && setRetracting(null)}
        title={retracting && isNotification(retracting) ? 'Clear this notification?' : 'Take this message back?'}
        description={
          retracting
            ? `“${retracting.title}” disappears from everyone's inbox${isNotification(retracting) ? ' and from this list' : ''}. This can't be undone.`
            : undefined
        }
        confirmLabel={retracting && isNotification(retracting) ? 'Clear' : 'Take back'}
        pending={retract.isPending}
        onConfirm={() => retracting && retract.mutate(retracting.id)}
      />
      <ConfirmDialog
        open={clearingAll}
        onOpenChange={setClearingAll}
        title="Clear all notifications?"
        description="Every automatic notification is deleted, from this list and from people's phones. Mail you sent is not touched. This can't be undone."
        confirmLabel="Clear all"
        pending={clearAll.isPending}
        onConfirm={() => clearAll.mutate()}
      />
    </PagedListFrame>
  );
}
