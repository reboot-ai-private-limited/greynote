import { redirect } from 'next/navigation';

/** Routes is the Territory page's "All routes" tab since 2026-11-27; the filters come along. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === 'string') params.set(key, value);
  params.set('tab', 'routes');
  redirect(`/territory?${params.toString()}`);
}
