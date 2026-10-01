import { redirect } from 'next/navigation';
import { LANDING_PATH } from '@/lib/auth/next-path';

export default function Home() {
  redirect(LANDING_PATH);
}
