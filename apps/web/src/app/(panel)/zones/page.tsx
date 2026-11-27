import { redirect } from 'next/navigation';

/** Zones, HQs and Places are one Territory page since 2026-11-27. */
export default function Page() {
  redirect('/territory');
}
