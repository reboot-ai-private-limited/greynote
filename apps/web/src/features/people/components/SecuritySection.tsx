'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Textarea } from '@/components/ui/Input';
import { formatDate } from '@/lib/format';
import { useDeactivateUser, useResetPassword, useUnblockUser } from '../hooks/useUsers';
import {
  DEACTIVATE_BLOCK_COPY,
  DEACTIVATE_CONSEQUENCE,
  RESET_CONSEQUENCE,
  deactivateBlock,
  resetPasswordError,
} from '../lib/security';
import { PasswordField } from './PasswordField';

/** Admin account controls: reset the password, clear a compliance block (with a reason), deactivate. */
export function SecuritySection({
  user,
  selfId,
  readOnly,
}: {
  user: UserDetailDto;
  selfId: string | undefined;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-6">
      <ResetPasswordCard user={user} readOnly={readOnly} />
      {user.isBlocked ? <UnblockCard user={user} readOnly={readOnly} /> : null}
      {user.blockHistory.length > 0 ? <BlockHistoryCard user={user} /> : null}
      <DeactivateCard user={user} selfId={selfId} readOnly={readOnly} />
    </div>
  );
}

function ResetPasswordCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const reset = useResetPassword(user.id, () => {
    setConfirming(false);
    setPassword('');
  });

  return (
    <Card
      title="Reset password"
      description="Sets a new password for this employee. Only an Admin can."
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const problem = resetPasswordError(password);
          setError(problem);
          if (!problem) setConfirming(true);
        }}
        className="flex flex-wrap items-start gap-4 p-5"
      >
        <div className="min-w-72 flex-1">
          <PasswordField
            id="reset-password"
            label="New password"
            hint="Tell the employee in person or by phone; it is not shown again."
            value={password}
            error={error}
            onChange={setPassword}
          />
        </div>
        <div className="sm:pt-[1.625rem]">
          <Button
            type="submit"
            disabled={readOnly}
            title={readOnly ? 'A past financial year is read-only' : undefined}
          >
            Reset password
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reset password"
        description={RESET_CONSEQUENCE}
        confirmLabel="Reset password"
        pending={reset.isPending}
        onConfirm={() => reset.mutate(password)}
      />
    </Card>
  );
}

function UnblockCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const unblock = useUnblockUser(user.id, () => {
    setOpen(false);
    setReason('');
  });
  const block = user.currentBlock;

  function submit() {
    const problem = reason.trim() ? undefined : 'A reason is required.';
    setError(problem);
    if (!problem) unblock.mutate(reason.trim());
  }

  return (
    <Card
      title="Blocked"
      description="The system blocked this employee for missing a daily report. Admin or their manager can clear it; the reason is kept."
    >
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-text">
          {block
            ? `${block.reason} · since ${formatDate(block.blockedAt)}`
            : 'Blocked, with no reason recorded.'}
        </p>
        <Button
          disabled={readOnly}
          title={readOnly ? 'A past financial year is read-only' : undefined}
          onClick={() => setOpen(true)}
        >
          Unblock
        </Button>
      </div>
      {open ? (
        <FormDialog
          title="Unblock employee"
          description="They can log daily reports again, with a clean slate for the missed-report check."
          formId="unblock-form"
          pending={unblock.isPending}
          onClose={() => setOpen(false)}
          onSubmit={submit}
        >
          <FormField
            label="Reason"
            htmlFor="unblock-reason"
            error={error}
            hint="Required. Kept with the block, with who cleared it and when."
          >
            <Textarea
              id="unblock-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-invalid={error ? true : undefined}
            />
          </FormField>
        </FormDialog>
      ) : null}
    </Card>
  );
}

/** Every block on the employee, newest first: why, and who cleared it and why. */
function BlockHistoryCard({ user }: { user: UserDetailDto }) {
  return (
    <Card
      title="Block history"
      description="Each time the system blocked this employee, and how it was cleared."
    >
      <ul className="divide-y divide-border">
        {user.blockHistory.map((b) => (
          <li key={b.blockedAt} className="space-y-1 p-5 text-sm">
            <p className="text-text">
              {b.reason} · blocked {formatDate(b.blockedAt)}
            </p>
            <p className="text-text-muted">
              {b.unblockedAt
                ? `Cleared ${formatDate(b.unblockedAt)} by ${b.unblockedByRole === 'ADMIN' ? 'Admin' : 'their manager'}: ${b.unblockReason ?? 'no reason recorded'}`
                : 'Still blocked.'}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DeactivateCard({
  user,
  selfId,
  readOnly,
}: {
  user: UserDetailDto;
  selfId: string | undefined;
  readOnly: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const deactivate = useDeactivateUser(user.id, () => setConfirming(false));
  const block = deactivateBlock(user, selfId);
  return (
    <Card title="Deactivate account" description="For an employee who has left.">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="max-w-xl text-sm text-text-muted">
          {block ? DEACTIVATE_BLOCK_COPY[block] : DEACTIVATE_CONSEQUENCE}
        </p>
        <Button
          variant="danger"
          disabled={readOnly || block !== null}
          title={readOnly ? 'A past financial year is read-only' : undefined}
          onClick={() => setConfirming(true)}
        >
          Deactivate
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Deactivate ${user.name}`}
        description={DEACTIVATE_CONSEQUENCE}
        confirmLabel="Deactivate"
        pending={deactivate.isPending}
        onConfirm={() => deactivate.mutate(undefined)}
      />
    </Card>
  );
}
