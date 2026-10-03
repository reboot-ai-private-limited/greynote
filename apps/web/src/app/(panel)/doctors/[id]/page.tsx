import { DoctorScreen } from '@/features/field-master-data/components/DoctorScreen';

export default async function DoctorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DoctorScreen id={id} />;
}
