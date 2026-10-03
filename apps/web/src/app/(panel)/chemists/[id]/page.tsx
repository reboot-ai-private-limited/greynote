import { ChemistFormScreen } from '@/features/field-master-data/components/ChemistFormScreen';

export default async function ChemistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChemistFormScreen id={id} />;
}
