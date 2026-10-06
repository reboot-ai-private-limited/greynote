import { PromotionScreen } from '@/features/people/components/PromotionScreen';

export default async function PromoteEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PromotionScreen id={id} />;
}
