'use client';

import Link from 'next/link';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/lib/auth/SessionProvider';

/** Shown inside the shell when the signed-in role may not open this screen, so the person is told, not shown an API error. */
export function NoAccessScreen() {
  return (
    <EmptyState
      title="You do not have access to this page"
      description="Your role cannot open it. If you need it, ask your administrator."
      action={
        <Link href="/dashboard" className="text-sm font-medium text-accent hover:underline">
          Back to the dashboard
        </Link>
      }
    />
  );
}

/** A field employee who somehow holds a web session: the portal is not for them, whatever page they type. */
export function FieldNotAllowedScreen() {
  const { signOut } = useSession();
  return (
    <main className="grid min-h-screen place-items-center">
      <EmptyState
        title="The web portal is for office staff"
        description="Please use the mobile app."
        action={<Button variant="secondary" onClick={() => void signOut()}>Sign out</Button>}
      />
    </main>
  );
}
