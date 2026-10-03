'use client';

import { PayBandsScreen } from '@/features/people/components/PayBandsScreen';
import { useSession } from '@/lib/auth/SessionProvider';

export default function PayBandsPage() {
  const { user } = useSession();
  // The Accountant can read pay grades (PRD §5.3) but not change them; the API enforces it too.
  return <PayBandsScreen canWrite={user?.role === 'ADMIN' || user?.role === 'HR'} />;
}
