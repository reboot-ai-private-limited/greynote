'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { ApiError, NetworkError } from '@/lib/api/ApiError';
import { authApi } from '@/lib/api/endpoints/auth';

const RESEND_SECONDS = 60;
const messageOf = (cause: unknown) =>
  cause instanceof ApiError || cause instanceof NetworkError
    ? cause.message
    : 'Something went wrong. Try again.';

/**
 * An Admin who forgot their password: enter the employee code, the owner is emailed a 6-digit code, then enter the code and a new
 * password here. The first step says the same thing for any code, so it never reveals who is an Admin.
 */
export function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'ask' | 'confirm'>('ask');
  const [employeeCode, setEmployeeCode] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function ask(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await authApi.forgotPassword({ employeeCode: employeeCode.trim() });
      setStep('confirm');
      setWait(RESEND_SECONDS);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authApi.resetAdminPassword({
        employeeCode: employeeCode.trim(),
        otp: otp.trim(),
        newPassword: password,
      });
      toast.success('Password changed. Sign in with the new password.');
      router.replace('/login');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-surface p-6">
      <div className="w-full max-w-sm space-y-5">
        <Image
          src="/brand/logo.png"
          alt="Greynote Healthcare"
          width={702}
          height={523}
          className="h-16 w-auto"
        />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text">Forgot password</h1>
          <p className="mt-1 text-sm text-text-muted">
            {step === 'ask'
              ? 'For Admin accounts. A one-time code is emailed to the owner, who gives it to you.'
              : 'If that is an Admin account, a code was sent to the owner. Enter it with your new password. It works once and expires in 10 minutes.'}
          </p>
        </div>
        {step === 'ask' ? (
          <form onSubmit={ask} className="space-y-5">
            <FormField label="Employee code" htmlFor="employeeCode" error={error ?? undefined}>
              <Input
                id="employeeCode"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                autoComplete="username"
                required
              />
            </FormField>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Sending…' : 'Send the code to the owner'}
            </Button>
          </form>
        ) : (
          <form onSubmit={confirm} className="space-y-5">
            <FormField label="Code from the owner" htmlFor="otp">
              <Input
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
              />
            </FormField>
            <FormField label="New password" htmlFor="newPassword">
              <Input
                id="newPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </FormField>
            <FormField label="New password again" htmlFor="again" error={error ?? undefined}>
              <Input
                id="again"
                type="password"
                value={again}
                onChange={(e) => setAgain(e.target.value)}
                autoComplete="new-password"
                required
              />
            </FormField>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Saving…' : 'Change password'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || wait > 0}
              onClick={() => void ask()}
              className="w-full"
            >
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </Button>
          </form>
        )}
        <p className="text-sm">
          <Link href="/login" className="text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
