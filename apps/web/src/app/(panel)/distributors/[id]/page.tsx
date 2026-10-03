import { DistributorFormScreen } from '@/features/field-master-data/components/DistributorFormScreen';

export default async function DistributorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DistributorFormScreen id={id} />;
}
