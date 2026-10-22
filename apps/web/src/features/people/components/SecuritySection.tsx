'use client';

import type { UserDetailDto } from '@greynote/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog } from '@/components/ui/FormDialog';
import { FormField } from '@/components/ui/FormField';
import { Input, Textarea } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { formatDate } from '@/lib/format';
import { useDeactivateUser, useReactivateUser, useResetPassword, useUnblockUser } from '../hooks/useUsers';
import {
  DEACTIVATE_BLOCK_COPY,
  DEACTIVATE_CONSEQUENCE,
  RESET_CONSEQUENCE,
  deactivateBlock,
  resetPasswordError,
} from '../lib/security';
import { DeactivateEmployeeDialog } from './DeactivateEmployeeDialog';
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
  const [open, setOpen] = useState(false);
  const block = deactivateBlock(user, selfId);
  if (user.status === 'inactive') return <InactiveCard user={user} readOnly={readOnly} />;
  return (
    <Card title="Deactivate employee" description="For an employee who has left: their team, routes and doctors are handed over in the same step.">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="max-w-xl text-sm text-text-muted">{block ? DEACTIVATE_BLOCK_COPY[block] : DEACTIVATE_CONSEQUENCE}</p>
        <Button variant="danger" disabled={readOnly || block !== null} title={readOnly ? 'A past financial year is read-only' : undefined} onClick={() => setOpen(true)}>
          Deactivate…
        </Button>
      </div>
      {open ? <DeactivateEmployeeDialog user={user} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

/** A deactivated employee: when they left, a rehire (reactivate from a rejoining date), and running the hand-over again if a part failed. */
function InactiveCard({ user, readOnly }: { user: UserDetailDto; readOnly: boolean }) {
  const [rejoining, setRejoining] = useState(false);
  const [rejoinedOn, setRejoinedOn] = useState('');
  const [error, setError] = useState<string | undefined>();
  const reactivate = useReactivateUser(user.id, () => setRejoining(false));
  const retry = useDeactivateUser(user.id, () => undefined);
  const left = user.profile?.lastWorkingDay ?? null;
  return (
    <Card title="Deactivated" description={left ? `Left on ${formatDate(left)}. They cannot sign in.` : 'They cannot sign in.'}>
      <div className="flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="max-w-xl text-sm text-text-muted">
          Reactivating (a rehire) lets them sign in again from a rejoining date. Nothing handed over comes back: set their manager, routes and doctors again.
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={readOnly || retry.isPending || !left}
            title="Runs the hand-over of routes, doctors, plans, leave and targets again, for any part that failed"
            onClick={() => left && retry.mutate({ lastWorkingDay: left }, { onSuccess: () => toast.success('The hand-over was run again.') })}
          >
            {retry.isPending ? 'Running…' : 'Run the hand-over again'}
          </Button>
          <Button disabled={readOnly} onClick={() => setRejoining(true)}>
            Reactivate…
          </Button>
        </div>
      </div>
      {rejoining ? (
        <FormDialog
          title={`Reactivate ${user.name}`}
          description={left ? `They left on ${formatDate(left)}. The rejoining date must be after it, and today or earlier.` : 'Today or earlier.'}
          formId="reactivate-form"
          pending={reactivate.isPending}
          onClose={() => setRejoining(false)}
          onSubmit={() => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(rejoinedOn)) return setError('Choose the rejoining date.');
            setError(undefined);
            reactivate.mutate({ rejoinedOn });
          }}
        >
          <FormField label="Rejoining date" htmlFor="rejoin-date" error={error}>
            <Input id="rejoin-date" type="date" value={rejoinedOn} onChange={(e) => setRejoinedOn(e.target.value)} />
          </FormField>
        </FormDialog>
      ) : null}
    </Card>
  );
}
