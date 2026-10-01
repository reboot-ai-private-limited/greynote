'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
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
    <main className="grid min-h-screen place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Sign in to Greynote</h1>
        <label htmlFor="employeeCode" className="block space-y-1 text-sm">
          Employee code
          <Input id="employeeCode" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} autoComplete="username" required />
        </label>
        <label htmlFor="password" className="block space-y-1 text-sm">
          Password
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
