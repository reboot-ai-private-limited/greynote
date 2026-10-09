import { CtcScreen } from '@/features/people/components/CtcScreen';

export default async function EmployeeCtcPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CtcScreen id={id} />;
}
