import { RouteDetailScreen } from '@/features/territory/components/RouteDetailScreen';

export default async function RouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RouteDetailScreen id={id} />;
}
