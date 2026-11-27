import { redirect } from 'next/navigation';

// Routes are made with "+ Route" on the Territory page (2026-11-27: one way to make a route).
export default function NewRoutePage() {
  redirect('/territory?tab=routes');
}
