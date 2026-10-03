import { ApprovalScreen } from '@/features/approvals/components/ApprovalScreen';

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApprovalScreen id={id} />;
}
