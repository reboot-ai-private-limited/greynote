'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

/** Admin-only account controls: reset the password, clear a compliance block, deactivate. */
export function SecuritySection({ user, selfId, readOnly }: { user: UserDetailDto; selfId: string | undefined; readOnly: boolean }) {
  return (
    <div className="space-y-6">
      <ResetPasswordCard user={user} readOnly={readOnly} />
      {user.isBlocked ? <UnblockCard user={user} readOnly={readOnly} /> : null}
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
    <Card title="Reset password" description="Sets a new password for this employee. Only an Admin can.">
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
          <Button type="submit" disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined}>
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
  const [confirming, setConfirming] = useState(false);
  const unblock = useUnblockUser(user.id, () => setConfirming(false));
  const block = user.currentBlock;
  return (
    <Card title="Blocked" description="The system blocked this employee for missing a daily report. Only an Admin can clear it.">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="text-sm text-text">
          {block ? `${block.reason} · since ${formatDate(block.blockedAt)}` : 'Blocked, with no reason recorded.'}
        </p>
        <Button disabled={readOnly} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setConfirming(true)}>
          Unblock
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Unblock employee"
        description="They can log daily reports again, with a clean slate for the missed-report check."
        confirmLabel="Unblock"
        tone="primary"
        pending={unblock.isPending}
        onConfirm={() => unblock.mutate(undefined)}
      />
    </Card>
  );
}

function DeactivateCard({ user, selfId, readOnly }: { user: UserDetailDto; selfId: string | undefined; readOnly: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const deactivate = useDeactivateUser(user.id, () => setConfirming(false));
  const block = deactivateBlock(user, selfId);
  return (
    <Card title="Deactivate account" description="For an employee who has left.">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="max-w-xl text-sm text-text-muted">{block ? DEACTIVATE_BLOCK_COPY[block] : DEACTIVATE_CONSEQUENCE}</p>
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
