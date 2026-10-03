import { EmployeeDetailScreen } from '@/features/people/components/EmployeeDetailScreen';

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetailScreen id={id} />;
}
