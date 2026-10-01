import Link from 'next/link';
import { LANDING_PATH } from '@/lib/auth/next-path';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link href={LANDING_PATH} className="mt-2 inline-block text-sm text-accent underline">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
