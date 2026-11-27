import { redirect } from 'next/navigation';

// A route opens in the route dialog on the Territory page's All routes tab (2026-11-27: the route page is gone).
export default async function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/territory?tab=routes&route=${encodeURIComponent(id)}`);
}
