'use client';

import { PayComponentsScreen } from '@/features/people/components/PayComponentsScreen';
import { useSession } from '@/lib/auth/SessionProvider';

export default function PayComponentsPage() {
  const { user } = useSession();
  // The Accountant can read the formula but not change it; the API enforces it too.
  return <PayComponentsScreen canWrite={user?.role === 'ADMIN'} />;
}
