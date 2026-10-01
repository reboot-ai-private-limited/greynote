'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { ApiError, NetworkError } from '@/lib/api/ApiError';
import { useSession } from '@/lib/auth/SessionProvider';
import { destinationAfterLogin } from '@/lib/auth/next-path';

export function LoginScreen() {
  const { status, signIn } = useSession();
  const router = useRouter();
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in (or just became so): go where the gate parked us.
  useEffect(() => {
    if (status === 'authenticated') router.replace(destinationAfterLogin());
  }, [status, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(employeeCode.trim(), password);
    } catch (cause) {
      // The server's wording, verbatim — it deliberately does not say which field was wrong.
      setError(cause instanceof ApiError || cause instanceof NetworkError ? cause.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden flex-col justify-between bg-accent-900 p-12 text-accent-50 lg:flex">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-md bg-surface text-base font-bold text-accent-900">
            G
          </span>
          <span className="text-xl font-semibold tracking-tight">Greynote</span>
        </div>
        <div>
          <p className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Field force, plans and payroll in one place.
          </p>
          <p className="mt-3 max-w-sm text-sm text-accent-200">The Admin, HR and Accountant portal.</p>
        </div>
        <p className="text-xs text-accent-300">© Greynote</p>
      </section>

      <section className="grid place-items-center bg-surface p-6">
        <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">Sign in</h1>
            <p className="mt-1 text-sm text-text-muted">Use your employee code and password.</p>
          </div>
          <FormField label="Employee code" htmlFor="employeeCode">
            <Input id="employeeCode" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} autoComplete="username" required />
          </FormField>
          <FormField label="Password" htmlFor="password" error={error ?? undefined}>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              aria-invalid={error ? true : undefined}
              required
            />
          </FormField>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </section>
    </main>
  );
}
