import type { FinalizedEmployeeDto } from '@greynote/contracts';
import { Check, Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { credentialsMessage } from '../../lib/onboarding';

/** Shown once, right after the employee is created: the generated ID and password, to copy or share. */
export function CredentialsCard({
  name,
  result,
  onOpenProfile,
  onAddAnother,
}: {
  name: string;
  result: FinalizedEmployeeDto;
  onOpenProfile: () => void;
  onAddAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const message = credentialsMessage(name, result.employeeCode, result.password);
  // `navigator.share` exists on phones and some desktops; elsewhere only Copy is offered.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the text and copy it by hand.');
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Greynote login', text: message });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  return (
    <div className="mx-auto max-w-lg text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-bg text-success-fg">
        <Check aria-hidden className="size-7" />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text">{name} is added</h1>
      <dl className="mt-6 divide-y divide-border rounded-lg border border-border bg-surface text-left">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <dt className="text-sm text-text-muted">Employee ID</dt>
          <dd className="select-all font-mono text-lg font-semibold tracking-wide text-text">{result.employeeCode}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <dt className="text-sm text-text-muted">Password</dt>
          <dd className="select-all font-mono text-lg font-semibold tracking-wide text-text">{result.password}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[13px] text-text-subtle">The password is shown only now. Share it before leaving this page.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Button onClick={() => void copy()}>
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void share()}>
            <Share2 aria-hidden className="size-4" /> Share
          </Button>
        ) : null}
      </div>
      <div className="mt-8 flex justify-center gap-3 border-t border-border pt-6">
        <Button variant="ghost" onClick={onAddAnother}>
          Add another
        </Button>
        <Button variant="secondary" onClick={onOpenProfile}>
          Open profile
        </Button>
      </div>
    </div>
  );
}
